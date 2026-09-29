const {
  getRecentJournal,
  getRecentScans,
  getRecentTrades,
  getOpenTrade,
  getTradeStats,
} = require("../../lib/supabase");

export default async function handler(req, res) {
  try {
    const [journal, scans, trades, open, stats] = await Promise.all([
      getRecentJournal(100),
      getRecentScans(50),
      getRecentTrades(100),
      getOpenTrade(),
      getTradeStats(),
    ]);
    return res.status(200).json({
      ok: true,
      openTrade: open,
      journal,
      scans,
      trades,
      stats,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
