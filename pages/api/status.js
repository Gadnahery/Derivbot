const {
  getRecentJournal,
  getRecentScans,
  getRecentTrades,
  getOpenTrade,
} = require("../../lib/supabase");

export default async function handler(req, res) {
  try {
    const [journal, scans, trades, open] = await Promise.all([
      getRecentJournal(50),
      getRecentScans(20),
      getRecentTrades(20),
      getOpenTrade(),
    ]);
    return res.status(200).json({
      ok: true,
      openTrade: open,
      journal,
      scans,
      trades,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
