const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL || "https://yqozgegwhkqosnukevjb.supabase.co";
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || "";

function getClient() {
  if (!key) throw new Error("SUPABASE_ANON_KEY not set");
  return createClient(url, key);
}

async function ensureTables() {
  // Tables must be created once via SQL editor or Management API.
  // We only read/write here.
  return true;
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
  const sb = getClient();
  const { data, error } = await sb
    .from("bot_trades")
    .select("*")
    .eq("status", "open")
    .order("at", { ascending: false })
    .limit(1);
  if (error) return null;
  return data?.[0] || null;
}

async function saveTrade(trade) {
  const sb = getClient();
  const { data, error } = await sb
    .from("bot_trades")
    .insert({
      at: new Date().toISOString(),
      symbol: trade.symbol,
      symbol_name: trade.symbolName,
      side: trade.side,
      entry: trade.entry,
      sl: trade.sl,
      tp: trade.tp,
      rr: trade.rr,
      stake: trade.stake,
      status: trade.status,
      contract_id: trade.contractId || null,
      score: trade.score || null,
      note: trade.note || null,
    })
    .select()
    .single();
  if (error) {
    console.error("trade insert:", error.message);
    return null;
  }
  return data;
}

async function getSeenKeys() {
  const sb = getClient();
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data } = await sb
    .from("bot_trades")
    .select("symbol,side,note")
    .gte("at", since)
    .limit(200);
  const keys = new Set();
  for (const t of data || []) {
    if (t.note && t.note.startsWith("key:")) keys.add(t.note.slice(4));
  }
  return keys;
}

async function getRecentJournal(limit = 40) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_journal")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentScans(limit = 20) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_scans")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentTrades(limit = 20) {
  const sb = getClient();
  const { data } = await sb
    .from("bot_trades")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  return data || [];
}

module.exports = {
  getClient,
  logEvent,
  saveScanResult,
  getOpenTrade,
  saveTrade,
  getSeenKeys,
  getRecentJournal,
  getRecentScans,
  getRecentTrades,
};
