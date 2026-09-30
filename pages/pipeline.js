import Layout from "../components/Layout";
import { useDesk, fmtTime, statusColor, SYMBOLS } from "../lib/useDesk";
import { useMemo, useState } from "react";

function stepsFor(scalpMode, chain) {
  const gold = chain === "gold";
  if (scalpMode) {
    return [
      { id: "dominance", label: "1. Market direction (1H scalp)", why: "Scalp mode uses 1H body-close BOS for bias — still never fight this side." },
      { id: "skill8", label: "2. Pullback filter", why: "If price moves against bias, check leftover liquidity. Liquidity left = pullback, stay with bias." },
      { id: "h1", label: "3. Context zone", why: "Nearby structure on the bias frame." },
      { id: "ob", label: gold ? "4. Real entry zone (3m)" : "4. Real entry zone (5m)", why: gold ? "Scalp gold: 3m order block — last opposing candle before impulse." : "Scalp FX/BTC: 5m order block — last opposing candle before impulse." },
      { id: "sweep1", label: "5. First stop hunt", why: "First sweep is bait. Retail enters early here — we do not." },
      { id: "sweep2", label: "6. Second shallower sweep", why: "Shallower second sweep means the other side is exhausted." },
      { id: "body1", label: "7. Rejection candle (C1)", why: "Wick through the level, body closes back — attempt failed." },
      { id: "body2", label: "8. Confirmation (C2 · 1m)", why: "Next candle body closes beyond C1 — entry trigger on 1m." },
      { id: "rr", label: "9. Minimum 3R", why: "Distance to next liquidity pool must pay at least 3× risk." },
      { id: "score", label: "10. Selectivity score", why: "Score must clear the nurse threshold (≥50) or we skip." },
    ];
  }
  return [
    { id: "dominance", label: "1. Market direction (4H)", why: "4H body-close break of structure sets bull or bear bias. We never fight this side." },
    { id: "skill8", label: "2. Pullback filter", why: "If price moves against bias, we check leftover liquidity. Liquidity left = pullback, stay with bias." },
    { id: "h1", label: "3. Big zone (1H)", why: "Marks the institutional order-block area price is likely drawn toward." },
    { id: "ob", label: gold ? "4. Real entry zone (5m)" : "4. Real entry zone (15m)", why: gold ? "Gold chain: 5m OB — last opposing candle before the impulse." : "Forex/BTC: 15m OB — last opposing candle before the impulse." },
    { id: "sweep1", label: "5. First stop hunt", why: "First sweep is bait. Retail enters early here — we do not." },
    { id: "sweep2", label: "6. Second shallower sweep", why: "Shallower second sweep means the other side is exhausted. This is our zone." },
    { id: "body1", label: "7. Rejection candle (C1)", why: "Wick through the level, body closes back — attempt failed." },
    { id: "body2", label: "8. Confirmation (C2)", why: "Next candle body closes beyond C1 — proof the other side took control. Entry trigger." },
    { id: "rr", label: "9. Minimum 3R", why: "Distance to next liquidity pool must pay at least 3× risk. Otherwise skip." },
    { id: "score", label: "10. Selectivity score", why: "Score must clear the nurse threshold (≥50) or we skip." },
  ];
}

export default function PipelinePage() {
  const { data, err, scanning, load, runScan, scalpMode, toggleScalp } = useDesk();
  const [symbol, setSymbol] = useState("frxEURUSD");
  const open = data?.openTrade;
  const openTrades = data?.openTrades || (open ? [open] : []);
  const statusLabel = openTrades.length ? `IN TRADE ×${openTrades.length}` : "STANDBY";
  const meta = SYMBOLS.find((s) => s.symbol === symbol);
  const STEPS = stepsFor(scalpMode, meta?.chain || "forex");

  const state = useMemo(() => {
    const by = {};
    for (const s of STEPS) {
      by[s.id] = { status: "wait", message: "Not evaluated for this pair on the latest scan." };
    }

    // ONLY this symbol — newest first. Never use another pair. Never resurrect old setups.
    const scansForSym = (data?.scans || [])
      .filter((x) => x.symbol === symbol)
      .sort((a, b) => new Date(b.at) - new Date(a.at));

    // Latest scan only (within reason). Mode preference only among the last ~3 scans.
    const recent = scansForSym.slice(0, 3);
    let scan = scansForSym[0] || null;
    if (scan && recent.length) {
      if (scalpMode) {
        const m = recent.find((s) =>
          s.setup?.mode === "SCALP" || (s.log || []).some((l) => /SCALP/i.test(String(l.msg || l.message || "")))
        );
        if (m) scan = m;
      } else {
        const m = recent.find((s) =>
          s.setup?.mode === "STANDARD" || (s.log || []).some((l) => /STANDARD/i.test(String(l.msg || l.message || "")))
        );
        if (m) scan = m;
      }
    }

    if (scan?.log && Array.isArray(scan.log)) {
      for (const l of scan.log) {
        const stage = l.stage;
        if (stage && by[stage]) {
          by[stage] = { status: l.status || "ok", message: l.msg || l.message || "" };
        }
      }
    }

    // Journal ONLY for this symbol
    for (const j of (data?.journal || []).filter((x) => x.symbol === symbol).slice(0, 40)) {
      if (j.stage && by[j.stage]) {
        by[j.stage] = { status: j.status || "ok", message: j.message || "" };
      }
    }

    // Active setup = ONLY on the chosen latest scan. No fallback to hours-old setups.
    let setup = scan?.setup && scan.symbol === symbol ? scan.setup : null;

    // Drop if setup is older than 15 minutes (already played out)
    if (setup && scan?.at) {
      const ageMin = (Date.now() - new Date(scan.at).getTime()) / 60000;
      if (ageMin > 15) setup = null;
    }

    // Drop if we already have a closed trade for same symbol+side+entry (passed trade)
    if (setup) {
      const trades = data?.trades || [];
      const matched = trades.find((tr) => {
        if (tr.symbol !== symbol) return false;
        if (tr.side && setup.side && tr.side !== setup.side) return false;
        const sameEntry = tr.entry != null && setup.entry != null && Math.abs(Number(tr.entry) - Number(setup.entry)) < Math.abs(Number(setup.entry)) * 0.0002;
        const done = ["won", "lost", "paper"].includes(tr.status);
        return sameEntry && done;
      });
      if (matched) setup = null;
    }

    return { by, scan, setup };
  }, [data, symbol, scalpMode, STEPS]);

  const openOnPair = openTrades.filter((t) => t.symbol === symbol);

  return (
    <Layout
      scanning={scanning}
      onScan={runScan}
      onRefresh={load}
      statusLabel={statusLabel}
      scalpMode={scalpMode}
      onToggleScalp={toggleScalp}
    >
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Strategy pipeline</h1>
      <p style={{ margin: "0 0 12px", opacity: 0.55, fontSize: 13, maxWidth: 720 }}>
        Each pair has its own evaluation. {scalpMode ? "SCALP mode: 1H bias · faster OB/entry frames." : "STANDARD mode: 4H bias · full chain."}{" "}
        A trade only appears when every required step is OK and reward is at least 3R.
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.6,
            padding: "6px 10px",
            borderRadius: 8,
            background: scalpMode ? "#1a2744" : "#102018",
            border: `1px solid ${scalpMode ? "#2962ff" : "#1a3d2a"}`,
            color: scalpMode ? "#8ab4ff" : "#3dd68c",
          }}
        >
          {scalpMode ? "SCALP TIMEFRAMES" : "STANDARD TIMEFRAMES"}
        </span>
        <button
          type="button"
          onClick={toggleScalp}
          style={{
            background: scalpMode ? "#2962ff" : "#121820",
            color: "#fff",
            border: "1px solid #243044",
            borderRadius: 8,
            padding: "6px 12px",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {scalpMode ? "Switch to Standard" : "Switch to Scalp"}
        </button>
      </div>

      {err && (
        <div style={{ background: "#2a1215", color: "#f07178", padding: 12, borderRadius: 10, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {SYMBOLS.map((s) => (
          <button
            key={s.symbol}
            type="button"
            onClick={() => setSymbol(s.symbol)}
            style={{
              background: symbol === s.symbol ? "#1a7f4b" : "#121820",
              color: "#fff",
              border: "1px solid #243044",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {openOnPair.length > 0 && (
        <div style={{ background: "#1a1520", border: "1px solid #3d2a4a", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>Open on {meta?.name}</div>
          {openOnPair.map((t) => (
            <div key={t.id} style={{ fontSize: 13, marginTop: 4 }}>
              {(t.side || "").toUpperCase()} · E {t.entry} · SL {t.sl} · TP {t.tp}
              {t.unrealized_pnl != null && ` · uPnL ${Number(t.unrealized_pnl).toFixed(2)}`}
            </div>
          ))}
        </div>
      )}

      {state.setup ? (
        <div style={{ background: "#102018", border: "1px solid #1a3d2a", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>
            Active setup · {meta?.name} · {meta?.mt5} · {state.setup.mode || (scalpMode ? "SCALP" : "STANDARD")}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#7aa2f7", marginTop: 4 }}>
            {Number(state.setup.rr).toFixed(1)}R · {(state.setup.side || "").toUpperCase()}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            Entry {state.setup.entry} · SL {state.setup.sl} · TP {state.setup.tp}
            {state.setup.score != null && ` · Score ${state.setup.score}`}
          </div>
        </div>
      ) : (
        <div style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, opacity: 0.7 }}>
          No active setup for <b>{meta?.name}</b> on the latest scan
          {scalpMode ? " (scalp)" : " (standard)"}. Steps below show where this pair is waiting.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {STEPS.map((step) => {
          const st = state.by[step.id] || { status: "wait", message: "—" };
          return (
            <div key={step.id} style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 700 }}>{step.label}</div>
                <div style={{ color: statusColor(st.status), fontWeight: 800, fontSize: 12 }}>
                  {String(st.status).toUpperCase()}
                </div>
              </div>
              <div style={{ fontSize: 13, opacity: 0.65, marginTop: 6 }}>{step.why}</div>
              <div style={{ fontSize: 13, marginTop: 8, color: "#c5d0de" }}>{st.message}</div>
            </div>
          );
        })}
      </div>
      {state.scan?.at && (
        <p style={{ marginTop: 14, fontSize: 12, opacity: 0.45 }}>
          Last evaluation for {meta?.name}: {fmtTime(state.scan.at)}
        </p>
      )}
    </Layout>
  );
}
