import Layout from "../components/Layout";
import { useDesk, fmtTime, statusColor, SYMBOLS } from "../lib/useDesk";
import { useMemo, useState } from "react";

const STEPS = [
  { id: "dominance", label: "1. Market direction", why: "4H break of structure sets bull or bear bias. We never fight this side." },
  { id: "skill8", label: "2. Pullback filter", why: "If price moves against bias, we check leftover liquidity. Liquidity left = pullback, stay with bias." },
  { id: "h1", label: "3. Big zone (1H)", why: "Marks the institutional order-block area price is likely drawn toward." },
  { id: "ob", label: "4. Real entry zone", why: "Gold chain uses 5m OB; forex uses 15m OB — the last opposing candle before the impulse." },
  { id: "sweep1", label: "5. First stop hunt", why: "First sweep is bait. Retail enters early here — we do not." },
  { id: "sweep2", label: "6. Second shallower sweep", why: "Shallower second sweep means the other side is exhausted. This is our zone." },
  { id: "body1", label: "7. Rejection candle (C1)", why: "Wick through the level, body closes back — attempt failed." },
  { id: "body2", label: "8. Confirmation (C2)", why: "Next candle body closes beyond C1 — proof the other side took control. Entry trigger." },
  { id: "rr", label: "9. Minimum 3R", why: "Distance to next liquidity pool must pay at least 3× risk. Otherwise skip." },
];

export default function PipelinePage() {
  const { data, err, scanning, load, runScan, scalpMode, toggleScalp } = useDesk();
  const [symbol, setSymbol] = useState("frxEURUSD");
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";

  const state = useMemo(() => {
    const by = {};
    for (const s of STEPS) by[s.id] = { status: "wait", message: "Not evaluated on the latest scan yet." };
    const scan = (data?.scans || []).find((x) => x.symbol === symbol) || (data?.scans || [])[0];
    if (scan?.log && Array.isArray(scan.log)) {
      for (const l of scan.log) {
        if (l.stage && by[l.stage]) {
          by[l.stage] = { status: l.status || "ok", message: l.msg || l.message || "" };
        }
      }
    }
    for (const j of (data?.journal || []).filter((x) => !x.symbol || x.symbol === symbol).slice(0, 50)) {
      if (j.stage && by[j.stage]) {
        by[j.stage] = { status: j.status || "ok", message: j.message || "" };
      }
    }
    return { by, scan };
  }, [data, symbol]);

  const setup = state.scan?.setup;

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel} scalpMode={scalpMode} onToggleScalp={toggleScalp}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Strategy progress</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.55, fontSize: 13, maxWidth: 720 }}>
        This is the exact checklist the bot runs top-to-bottom. A trade is only taken when every required step is OK
        and reward is at least 3R. Anyone can read this page without knowing the internal skill numbers.
      </p>
      {err && <div style={{ background: "#2a1215", color: "#f07178", padding: 12, borderRadius: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {SYMBOLS.map((s) => (
          <button
            key={s.symbol}
            onClick={() => setSymbol(s.symbol)}
            style={{
              background: symbol === s.symbol ? "#1a7f4b" : "#121820",
              color: "#fff",
              border: "1px solid #243044",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {setup && (
        <div style={{ background: "#102018", border: "1px solid #1a3d2a", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Active setup on latest scan</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#7aa2f7", marginTop: 4 }}>
            {Number(setup.rr).toFixed(1)}R · {setup.side?.toUpperCase()}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            Entry {setup.entry} · SL {setup.sl} · TP {setup.tp}
            {setup.score != null && ` · Score ${setup.score}`}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {STEPS.map((step) => {
          const st = state.by[step.id];
          return (
            <div key={step.id} style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 700 }}>{step.label}</div>
                <div style={{ color: statusColor(st.status), fontWeight: 800, fontSize: 12 }}>{String(st.status).toUpperCase()}</div>
              </div>
              <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>{step.why}</div>
              <div style={{ fontSize: 13, marginTop: 8, color: "#c5d0de" }}>{st.message}</div>
            </div>
          );
        })}
      </div>
      {state.scan?.at && (
        <p style={{ marginTop: 14, fontSize: 12, opacity: 0.45 }}>Last evaluation for this view: {fmtTime(state.scan.at)}</p>
      )}
    </Layout>
  );
}
