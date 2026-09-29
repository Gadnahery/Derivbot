import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [scanning, setScanning] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/status");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "status failed");
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      await fetch("/api/scan");
      await load();
    } catch (e) {
      setErr(e.message);
    }
    setScanning(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#0b0f14", color: "#e8eef5", minHeight: "100vh", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Strategy Bot Desk</h1>
          <p style={{ margin: "4px 0 0", opacity: 0.6, fontSize: 13 }}>
            Dominance · Sweep · Body-Close · min lot · Deriv demo
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={load} style={btn}>Refresh</button>
          <button onClick={runScan} disabled={scanning} style={{ ...btn, background: "#1a7f4b" }}>
            {scanning ? "Scanning…" : "Run scan now"}
          </button>
        </div>
      </header>

      {err && <div style={{ background: "#3a1515", padding: 12, borderRadius: 8, marginBottom: 16 }}>Error: {err}</div>}

      {data?.openTrade && (
        <section style={card}>
          <h2 style={h2}>Open trade</h2>
          <pre style={pre}>{JSON.stringify(data.openTrade, null, 2)}</pre>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section style={card}>
          <h2 style={h2}>Recent journal</h2>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {(data?.journal || []).map((j) => (
              <div key={j.id || j.at + j.message} style={{ borderBottom: "1px solid #1c2530", padding: "8px 0", fontSize: 12 }}>
                <span style={{ opacity: 0.5 }}>{new Date(j.at).toLocaleString()}</span>{" "}
                <span style={{ color: statusColor(j.status) }}>[{j.status}]</span>{" "}
                <b>{j.stage}</b> {j.symbol ? `(${j.symbol})` : ""} — {j.message}
              </div>
            ))}
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>Trades</h2>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {(data?.trades || []).map((t) => (
              <div key={t.id} style={{ borderBottom: "1px solid #1c2530", padding: "8px 0", fontSize: 12 }}>
                <b>{t.side?.toUpperCase()}</b> {t.symbol_name || t.symbol} · {t.status} · R:R {Number(t.rr).toFixed(1)}
                <div style={{ opacity: 0.6 }}>entry {t.entry} sl {t.sl} tp {t.tp}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Last scans</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
          {(data?.scans || []).slice(0, 10).map((s) => (
            <div key={s.id} style={{ background: "#111820", borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{s.symbol}</div>
              <div style={{ opacity: 0.6 }}>{new Date(s.at).toLocaleString()}</div>
              <div>bias: {s.bias || "—"}</div>
              <div style={{ color: s.has_setup ? "#3dd68c" : "#8899aa" }}>
                {s.has_setup ? "SETUP" : "no setup"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p style={{ marginTop: 24, opacity: 0.4, fontSize: 12 }}>
        Cron runs /api/scan every minute. State persisted in Supabase.
      </p>
    </div>
  );
}

function statusColor(s) {
  if (s === "ok") return "#3dd68c";
  if (s === "fail") return "#f07178";
  if (s === "wait") return "#e6c07b";
  return "#8899aa";
}

const btn = {
  background: "#1c2530",
  color: "#e8eef5",
  border: "1px solid #2a3544",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13,
};
const card = {
  background: "#111820",
  border: "1px solid #1c2530",
  borderRadius: 12,
  padding: 16,
};
const h2 = { margin: "0 0 12px", fontSize: 14, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1 };
const pre = { margin: 0, fontSize: 12, whiteSpace: "pre-wrap" };
