import Layout from "../components/Layout";
import { useDesk, fmtUsd, fmtTime, statusColor } from "../lib/useDesk";

export default function Overview() {
  const { data, err, scanning, load, runScan } = useDesk();
  const open = data?.openTrade;
  const stats = data?.stats;
  const setups = (data?.scans || []).filter((s) => s.setup || s.has_setup).slice(0, 6);
  const statusLabel = open ? "IN TRADE" : "STANDBY";

  // Best R:R among recent setups so it doesn't "disappear"
  const bestSetup = setups
    .map((s) => s.setup)
    .filter(Boolean)
    .sort((a, b) => Number(b.rr) - Number(a.rr))[0];

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel}>
      <h1 style={H}>Overview</h1>
      <p style={P}>
        The bot runs 24/7 via Supabase cron. This page is a live window — closing it does not stop trading.
      </p>
      {err && <div style={ERR}>{err}</div>}

      <div style={cards}>
        <Card title="Account status" value={statusLabel} sub={data?.at ? `Synced ${fmtTime(data.at)}` : "—"} />
        <Card
          title="Open PnL"
          value={open ? fmtUsd(open.unrealized_pnl) : "No open trade"}
          sub={open ? `Mark ${open.current_price ?? "—"}` : "Waiting for next full setup"}
          color={open ? (Number(open.unrealized_pnl) >= 0 ? "#3dd68c" : "#f07178") : undefined}
        />
        <Card
          title="Best recent R:R"
          value={bestSetup ? `${Number(bestSetup.rr).toFixed(1)}R` : "—"}
          sub={bestSetup ? `${bestSetup.side?.toUpperCase()} ${bestSetup.symbol || ""}` : "No setup stored yet"}
          color="#7aa2f7"
        />
        <Card
          title="Total realized PnL"
          value={stats ? fmtUsd(stats.totalPnl) : "—"}
          sub={stats ? `${stats.wins}W / ${stats.losses}L` : "—"}
          color={stats && Number(stats.totalPnl) >= 0 ? "#3dd68c" : "#f07178"}
        />
      </div>

      {open && (
        <section style={panel}>
          <div style={title}>Open trade</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: Number(open.unrealized_pnl) >= 0 ? "#3dd68c" : "#f07178" }}>
            {fmtUsd(open.unrealized_pnl)}
          </div>
          <div style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14 }}>
            <b style={{ color: open.side === "buy" ? "#3dd68c" : "#f07178" }}>{open.side?.toUpperCase()}</b>{" "}
            {open.symbol_name || open.symbol}
            <div>Entry {open.entry} · SL {open.sl} · TP {open.tp}</div>
            <div>
              Planned R:R <b style={{ color: "#7aa2f7" }}>{Number(open.rr).toFixed(2)}R</b> · Stake {open.stake} ·{" "}
              {open.execution || "—"}
            </div>
          </div>
        </section>
      )}

      <section style={{ ...panel, marginTop: 14 }}>
        <div style={title}>Recent setups (kept in Supabase)</div>
        {setups.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>No setups recorded yet. Run a scan or wait for cron.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {setups.map((s) => {
            const su = s.setup || {};
            return (
              <div key={s.id} style={mini}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <b>{s.symbol}</b>
                  <span style={{ color: "#7aa2f7", fontWeight: 800 }}>
                    {su.rr != null ? `${Number(su.rr).toFixed(1)}R` : "—"}
                  </span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {(su.side || s.bias || "—").toString().toUpperCase()} · {fmtTime(s.at)}
                </div>
                {su.entry != null && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    E {su.entry} · SL {su.sl} · TP {su.tp}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ ...panel, marginTop: 14 }}>
        <div style={title}>Latest activity (plain language)</div>
        {(data?.journal || []).slice(0, 8).map((j) => (
          <div key={j.id} style={{ borderBottom: "1px solid #15202b", padding: "8px 0", fontSize: 13 }}>
            <span style={{ color: statusColor(j.status), fontWeight: 700 }}>[{j.status}]</span>{" "}
            <b>{j.stage}</b> {j.symbol ? `· ${j.symbol}` : ""}
            <div style={{ opacity: 0.75 }}>{j.message}</div>
          </div>
        ))}
      </section>
    </Layout>
  );
}

function Card({ title, value, sub, color }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, color: color || "#e8eef5" }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

const H = { margin: "0 0 6px", fontSize: 22 };
const P = { margin: "0 0 16px", opacity: 0.55, fontSize: 13, maxWidth: 640 };
const ERR = { background: "#2a1215", border: "1px solid #5a2028", color: "#f07178", padding: 12, borderRadius: 10, marginBottom: 12 };
const cards = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, marginBottom: 14 };
const card = { background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 14 };
const panel = { background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 16 };
const title = { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", opacity: 0.6, marginBottom: 10 };
const mini = { background: "#111820", border: "1px solid #1c2a3a", borderRadius: 10, padding: 12 };
