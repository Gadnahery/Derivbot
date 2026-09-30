const {
  getRecentJournal,
  getRecentScans,
  getRecentTrades,
  getOpenTrade,
  getTradeStats,
  getRecentSignals,
} = require("../../lib/supabase");

export default async function handler(req, res) {
  try {
    const [journal, scans, trades, open, stats, signals] = await Promise.all([
      getRecentJournal(100),
      getRecentScans(50),
      getRecentTrades(100),
      getOpenTrade(),
      getTradeStats(),
      getRecentSignals(40),
    ]);
    return res.status(200).json({
      ok: true,
      openTrade: open,
      journal,
      scans,
      trades,
      stats,
      signals,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
