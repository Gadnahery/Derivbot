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
    // Optional live balance pull from Deriv
    if (String(req.query.refresh || "") === "1") {
      try {
        const { DerivClient } = require("../../lib/deriv");
        const { getSetting, setSetting } = require("../../lib/supabase");
        const mode = (await getSetting("accountMode", "demo")) === "live" ? "live" : "demo";
        const deriv = new DerivClient({ accountMode: mode });
        await deriv.authorize();
        await deriv.refreshBalance();
        await setSetting("accountSnap", {
          loginid: deriv.loginid,
          balance: deriv.balance,
          currency: deriv.currency,
          isDemo: !!deriv.isDemo,
          mode,
          at: new Date().toISOString(),
        });
        deriv.close();
      } catch (e) {
        console.error("status balance refresh", e.message);
      }
    }

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
