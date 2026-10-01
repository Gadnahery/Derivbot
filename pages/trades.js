import Layout from "../components/Layout";
import { useDesk, fmtUsd, fmtTime, statusColor } from "../lib/useDesk";

export default function TradesPage() {
  const { data, err, scanning, load, runScan, scalpMode, toggleScalp, accountMode, setAccount, balance, currency, accountId } = useDesk();
  const open = data?.openTrade;
  const trades = data?.trades || [];
  const statusLabel = open ? "IN TRADE" : "STANDBY";

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={() => load({ refresh: true })} statusLabel={statusLabel} scalpMode={scalpMode} onToggleScalp={toggleScalp} accountMode={accountMode} onSetAccount={setAccount} balance={balance} currency={currency} accountId={accountId}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Trades</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.55, fontSize: 13 }}>
        Every fill is stored in Supabase (entry, stop, target, planned R:R, realized PnL). Use this tomorrow to optimize.
      </p>
      {err && <div style={{ color: "#f07178" }}>{err}</div>}

      {open && (
        <div style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.55 }}>OPEN NOW</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: Number(open.unrealized_pnl) >= 0 ? "#3dd68c" : "#f07178" }}>
            {fmtUsd(open.unrealized_pnl)}
          </div>
          <div style={{ marginTop: 8 }}>
            {open.side?.toUpperCase()} {open.symbol_name || open.symbol} · planned{" "}
            <b style={{ color: "#7aa2f7" }}>{Number(open.rr).toFixed(2)}R</b>
          </div>
        </div>
      )}

      <div className="desk-table-wrap" style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#111820" }}>
              {["When", "Symbol", "Side", "R:R", "PnL", "Status", "Entry → Exit"].map((h) => (
                <th key={h} style={{ padding: "10px 12px", fontSize: 11, opacity: 0.55 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid #15202b" }}>
                <td style={{ padding: "10px 12px", opacity: 0.7 }}>{fmtTime(t.at)}</td>
                <td style={{ padding: "10px 12px" }}>{t.symbol_name || t.symbol}</td>
                <td style={{ padding: "10px 12px", color: t.side === "buy" ? "#3dd68c" : "#f07178", fontWeight: 700 }}>
                  {t.side?.toUpperCase()}
                </td>
                <td style={{ padding: "10px 12px", color: "#7aa2f7", fontWeight: 700 }}>
                  {t.rr != null ? `${Number(t.rr).toFixed(1)}R` : "—"}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: Number(t.status === "open" ? t.unrealized_pnl : t.pnl) >= 0 ? "#3dd68c" : "#f07178" }}>
                  {t.status === "open" ? fmtUsd(t.unrealized_pnl) : t.pnl != null ? fmtUsd(t.pnl) : "—"}
                </td>
                <td style={{ padding: "10px 12px", color: statusColor(t.status) }}>{t.status}</td>
                <td style={{ padding: "10px 12px", opacity: 0.75 }}>
                  {t.entry}{t.exit_price != null ? ` → ${t.exit_price}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && <div style={{ padding: 16, opacity: 0.5 }}>No trades stored yet.</div>}
      </div>
    </Layout>
  );
}
