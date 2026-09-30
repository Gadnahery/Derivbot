const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL || "https://yqozgegwhkqosnukevjb.supabase.co";
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || "";

function getClient() {
  if (!key) throw new Error("SUPABASE_ANON_KEY not set");
  return createClient(url, key);
}

async function logEvent(event) {
  const sb = getClient();
  const { error } = await sb.from("bot_journal").insert({
    at: new Date().toISOString(),
    symbol: event.symbol || null,
    stage: event.stage || null,
    status: event.status || null,
    message: event.message || null,
    payload: event.payload || null,
  });
  if (error) console.error("journal insert:", error.message);
}

async function saveScanResult(result) {
  const sb = getClient();
  const { error } = await sb.from("bot_scans").insert({
    at: new Date().toISOString(),
    symbol: result.symbol,
    bias: result.bias,
    has_setup: !!result.setup,
    setup: result.setup || null,
    log: result.log || [],
  });
  if (error) console.error("scan insert:", error.message);
}

async function getOpenTrade() {
  const list = await getOpenTrades();
  return list[0] || null;
}

async function getOpenTrades() {
  const sb = getClient();
  const { data, error } = await sb
    .from("bot_trades")
    .select("*")
    .eq("status", "open")
    .order("at", { ascending: false })
    .limit(20);
  if (error) return [];
  return data || [];
}

async function saveTrade(trade) {
  const sb = getClient();
  const { data, error } = await sb
    .from("bot_trades")
    .insert({
      at: new Date().toISOString(),
      symbol: trade.symbol,
      symbol_name: trade.symbolName || trade.symbol_name,
      side: trade.side,
      entry: trade.entry,
      sl: trade.sl,
      tp: trade.tp,
      rr: trade.rr,
      stake: trade.stake,
      status: trade.status,
      contract_id: trade.contractId || trade.contract_id || null,
      score: trade.score || null,
      note: trade.note || null,
      bias: trade.bias || null,
      execution: trade.execution || null,
      current_price: trade.current_price ?? trade.entry ?? null,
      unrealized_pnl: trade.unrealized_pnl ?? 0,
      pnl: trade.pnl ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("trade insert:", error.message);
    return null;
  }
  return data;
}

async function updateTrade(id, patch) {
  const sb = getClient();
  const { data, error } = await sb
    .from("bot_trades")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("trade update:", error.message);
    return null;
  }
  return data;
}

/** Linear R-based PnL model for multipliers (SL risk ≈ stake). */
function computePnl(trade, price) {
  const entry = Number(trade.entry);
  const sl = Number(trade.sl);
  const tp = Number(trade.tp);
  const stake = Number(trade.stake) || 0.35;
  const risk = Math.abs(entry - sl) || 1e-9;
  const side = trade.side;
  const move = side === "buy" ? price - entry : entry - price;
  const rMultiple = move / risk;
  const unrealized = stake * rMultiple;

  let hit = null;
  if (side === "buy") {
    if (price <= sl) hit = "lost";
    else if (price >= tp) hit = "won";
  } else {
    if (price >= sl) hit = "lost";
    else if (price <= tp) hit = "won";
  }

  let settledPnl = null;
  if (hit === "won") {
    const reward = Math.abs(tp - entry);
    settledPnl = stake * (reward / risk);
  } else if (hit === "lost") {
    settledPnl = -stake;
  }

  return { unrealized, hit, settledPnl, rMultiple };
}

async function getSeenKeys() {
  const sb = getClient();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await sb
    .from("bot_trades")
    .select("symbol,side,note,status")
    .gte("at", since)
    .limit(1000);
  const keys = new Set();
  for (const row of data || []) {
    if (row.note && row.note.includes("key:")) {
      const m = String(row.note).match(/key:([^\s|]+)/);
      if (m) keys.add(m[1]);
    }
  }
  return keys;
}

async function hasTradeKey(key) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_trades")
    .select("id,status,note")
    .ilike("note", `%key:${key}%`)
    .limit(1);
  return (data && data.length > 0) ? data[0] : null;
}

async function getRecentJournal(limit = 80) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_journal")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentScans(limit = 40) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_scans")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentTrades(limit = 100) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_trades")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getTradeStats() {
  const sb = getClient();
  const { data } = await sb
    .from("bot_trades")
    .select("status,pnl,stake,side,rr")
    .in("status", ["won", "lost", "open", "paper", "skipped"])
    .limit(500);
  const rows = data || [];
  const closed = rows.filter((t) => t.status === "won" || t.status === "lost");
  const wins = closed.filter((t) => t.status === "won");
  const losses = closed.filter((t) => t.status === "lost");
  const totalPnl = closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  return {
    totalTrades: rows.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    totalPnl,
    open: rows.filter((t) => t.status === "open").length,
    paper: rows.filter((t) => t.status === "paper").length,
  };
}


async function saveSignal(sig) {
  const sb = getClient();
  const { data, error } = await sb
    .from("bot_signals")
    .insert({
      at: new Date().toISOString(),
      symbol: sig.symbol,
      symbol_name: sig.symbolName || sig.symbol_name,
      mt5_symbol: sig.mt5 || sig.mt5_symbol,
      side: sig.side,
      entry: sig.entry,
      sl: sig.sl,
      tp: sig.tp,
      rr: sig.rr,
      score: sig.score || null,
      bias: sig.bias || null,
      criteria: sig.criteria || null,
      status: sig.status || "new",
      notified: !!sig.notified,
    })
    .select()
    .single();
  if (error) {
    console.error("signal insert:", error.message);
    return null;
  }
  return data;
}

async function getRecentSignals(limit = 50) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_signals")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function markSignalNotified(id) {
  const sb = getClient();
  await sb.from("bot_signals").update({ notified: true }).eq("id", id);
}

module.exports = {
  getClient,
  logEvent,
  saveScanResult,
  getOpenTrade,
  getOpenTrades,
  saveTrade,
  updateTrade,
  computePnl,
  getSeenKeys,
  getRecentJournal,
  getRecentScans,
  getRecentTrades,
  getTradeStats,
  hasTradeKey,
  saveSignal,
  getRecentSignals,
  markSignalNotified,
};
