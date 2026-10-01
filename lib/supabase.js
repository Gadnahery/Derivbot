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
      expires_at: trade.expires_at || null,
      duration: trade.duration ?? null,
      duration_unit: trade.durationUnit || trade.duration_unit || null,
      mode: trade.mode || null,
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

/**
 * PnL settlement:
 * - Rise/Fall (side rise|fall|call|put): win if price moved the right way AFTER expiry.
 * - Multiplier/FX (buy|sell + sl/tp): classic SL/TP hit.
 */
function computePnl(trade, price) {
  const entry = Number(trade.entry);
  const stake = Number(trade.stake) || 0.35;
  const side = String(trade.side || "").toLowerCase();
  const note = String(trade.note || "");
  const isRF =
    side === "rise" ||
    side === "fall" ||
    side === "call" ||
    side === "put" ||
    note.includes("risefall") ||
    trade.mode === "RISEFALL" ||
    trade.confirmMode === "rise" ||
    (trade.sl == null && trade.tp == null && (side === "rise" || side === "fall"));

  // ── Rise / Fall binary ──
  if (isRF) {
    const expiresAt = trade.expires_at ? new Date(trade.expires_at).getTime() : null;
    const now = Date.now();
    // duration seconds from trade fields
    let durSec = 60;
    if (trade.duration != null) {
      const u = String(trade.duration_unit || trade.durationUnit || "m");
      const d = Number(trade.duration) || 1;
      if (u === "t") durSec = Math.max(2, d * 2); // ~2s per tick approx for settlement wait
      else if (u === "s") durSec = d;
      else durSec = d * 60;
    } else if (expiresAt) {
      durSec = Math.max(5, Math.round((expiresAt - new Date(trade.at).getTime()) / 1000));
    }
    const opened = trade.at ? new Date(trade.at).getTime() : 0;
    const ready = expiresAt ? now >= expiresAt : now - opened >= durSec * 1000;

    const up = price > entry;
    const down = price < entry;
    const isRise = side === "rise" || side === "call" || side === "buy";
    const isFall = side === "fall" || side === "put" || side === "sell";

    let hit = null;
    if (ready) {
      if (price === entry) hit = "lost"; // barrier equal usually loss on RF
      else if (isRise) hit = up ? "won" : "lost";
      else if (isFall) hit = down ? "won" : "lost";
    }

    // Typical RF payout ~0.85–0.95 profit on stake (ask 0.35 → payout ~0.66 total return)
    const profitOnWin = stake * 0.85;
    const move = isRise ? price - entry : entry - price;
    const rMultiple = stake > 0 ? (hit === "won" ? profitOnWin / stake : hit === "lost" ? -1 : move / (Math.abs(entry) * 0.001 || 1)) : 0;
    const unrealized = hit === "won" ? profitOnWin : hit === "lost" ? -stake : stake * (move > 0 ? 0.5 : -0.5);
    const settledPnl = hit === "won" ? profitOnWin : hit === "lost" ? -stake : null;

    return { unrealized, hit, settledPnl, rMultiple, ready };
  }

  // ── Classic SL/TP ──
  const sl = Number(trade.sl);
  const tp = Number(trade.tp);
  const risk = Math.abs(entry - sl) || 1e-9;
  const move = side === "buy" || side === "rise" ? price - entry : entry - price;
  const rMultiple = move / risk;
  const unrealized = stake * rMultiple;

  let hit = null;
  if (side === "buy" || side === "rise") {
    if (!Number.isNaN(sl) && price <= sl) hit = "lost";
    else if (!Number.isNaN(tp) && price >= tp) hit = "won";
  } else {
    if (!Number.isNaN(sl) && price >= sl) hit = "lost";
    else if (!Number.isNaN(tp) && price <= tp) hit = "won";
  }

  let settledPnl = null;
  if (hit === "won") {
    const reward = Math.abs(tp - entry);
    settledPnl = stake * (reward / risk);
  } else if (hit === "lost") {
    settledPnl = -stake;
  }

  return { unrealized, hit, settledPnl, rMultiple, ready: true };
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

async function getRecentScans(limit = 80) {
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


async function getSetting(key, fallback = null) {
  try {
    const sb = getClient();
    const { data, error } = await sb.from("bot_settings").select("value").eq("key", key).maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  try {
    const sb = getClient();
    const { error } = await sb.from("bot_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.error("setSetting", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("setSetting", e.message);
    return false;
  }
}

module.exports = {
  getClient,
  getSetting,
  setSetting,
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
