const {
  getSetting,
  getRecentJournal,
  getRecentScans,
  getRecentTrades,
  getOpenTrade,
  getOpenTrades,
  getTradeStats,
  getRecentSignals,
} = require("../../lib/supabase");

export default async function handler(req, res) {
  try {
    const [journal, scans, trades, open, openTrades, stats, signals, accountMode, accountSnap] = await Promise.all([
      getRecentJournal(100),
      getRecentScans(100),
      getRecentTrades(100),
      getOpenTrade(),
      getOpenTrades(),
      getTradeStats(),
      getRecentSignals(40),
      getSetting("accountMode", "demo"),
      getSetting("accountSnap", null),
    ]);
    const snap = accountSnap && typeof accountSnap === "object" ? accountSnap : {};
    return res.status(200).json({
      ok: true,
      openTrade: open,
      openTrades: openTrades || [],
      journal,
      scans,
      trades,
      stats,
      signals,
      accountMode: accountMode === "live" ? "live" : "demo",
      account: {
        mode: accountMode === "live" ? "live" : "demo",
        loginid: snap.loginid || null,
        balance: snap.balance != null ? Number(snap.balance) : null,
        currency: snap.currency || "USD",
        isDemo: snap.isDemo != null ? snap.isDemo : accountMode !== "live",
      },
      balance: snap.balance != null ? Number(snap.balance) : null,
      currency: snap.currency || "USD",
      loginid: snap.loginid || null,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
