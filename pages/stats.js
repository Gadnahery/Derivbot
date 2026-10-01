import Layout from "../components/Layout";
import { useDesk, fmtUsd } from "../lib/useDesk";
import { useMemo } from "react";

export default function StatsPage() {
  const { data, err, scanning, load, runScan, scalpMode, toggleScalp, accountMode, setAccount, balance, currency, accountId } = useDesk();
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";
  const stats = data?.stats;
  const trades = data?.trades || [];

  const bySymbol = useMemo(() => {
    const map = {};
    for (const t of trades) {
      const k = t.symbol || "?";
      if (!map[k]) map[k] = { symbol: k, name: t.symbol_name || k, n: 0, wins: 0, losses: 0, pnl: 0, sumRr: 0 };
      map[k].n += 1;
      if (t.status === "won") map[k].wins += 1;
      if (t.status === "lost") map[k].losses += 1;
      if (t.pnl != null) map[k].pnl += Number(t.pnl);
      if (t.rr != null) map[k].sumRr += Number(t.rr);
    }
    return Object.values(map).sort((a, b) => b.n - a.n);
  }, [trades]);

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel} scalpMode={scalpMode} onToggleScalp={toggleScalp} accountMode={accountMode} onSetAccount={setAccount} balance={balance} currency={currency} accountId={accountId}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Performance</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.55, fontSize: 13 }}>
        Aggregates from stored trades. Review tomorrow before changing any strategy filters.
      </p>
      {err && <div style={{ color: "#f07178" }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          ["Closed", stats?.closed ?? "—"],
          ["Wins", stats?.wins ?? "—"],
          ["Losses", stats?.losses ?? "—"],
          ["Win rate", stats?.closed ? `${(stats.winRate * 100).toFixed(0)}%` : "—"],
          ["Total PnL", stats ? fmtUsd(stats.totalPnl) : "—"],
          ["Open", stats?.open ?? "—"],
        ].map(([k, v]) => (
          <div key={k} style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{k}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: k === "Total PnL" && stats && Number(stats.totalPnl) < 0 ? "#f07178" : "#e8eef5" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 10 }}>BY SYMBOL</div>
        {bySymbol.length === 0 && <div style={{ opacity: 0.5 }}>No closed data yet.</div>}
        {bySymbol.map((r) => (
          <div key={r.symbol} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.6fr 0.6fr 0.8fr 0.8fr", gap: 8, padding: "8px 0", borderTop: "1px solid #15202b", fontSize: 13 }}>
            <div>{r.name}</div>
            <div>{r.n} trades</div>
            <div>{r.wins}W / {r.losses}L</div>
            <div style={{ color: "#7aa2f7" }}>avg R {r.n ? (r.sumRr / r.n).toFixed(1) : "—"}</div>
            <div style={{ color: r.pnl >= 0 ? "#3dd68c" : "#f07178", fontWeight: 700 }}>{fmtUsd(r.pnl)}</div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
