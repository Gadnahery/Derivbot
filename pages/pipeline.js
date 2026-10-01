import Layout from "../components/Layout";
import { useDesk, fmtTime, statusColor, SYMBOLS } from "../lib/useDesk";
import { useMemo, useState } from "react";

/** Rise/Fall pipeline — matches scanRiseFall log stages */
const RF_STEPS = [
  {
    id: "dominance",
    label: "1. Market direction (5m body BOS)",
    why: "Who controls? Buyers → CALL only. Sellers → PUT only. No 5m BOS = no trade.",
  },
  {
    id: "body",
    label: "2. Pullback + body quality",
    why: "Wait for pullback against bias, then a real body (not doji / not exhaustion).",
  },
  {
    id: "body2",
    label: "3. Takeover confirmation (Skill 9)",
    why: "Confirm candle closes beyond prior body — buyers or sellers took control after the pullback.",
  },
  {
    id: "score",
    label: "4. Quality score",
    why: "Score must clear the gate. Weak / chop setups are skipped on purpose.",
  },
  {
    id: "setup",
    label: "5. Rise / Fall order",
    why: "Stake 0.35 · 1 minute · CALL (rise) or PUT (fall) on Vol 100.",
  },
];

export default function PipelinePage() {
  const {
    data,
    err,
    scanning,
    load,
    runScan,
    scalpMode,
    toggleScalp,
    accountMode,
    setAccount,
    balance,
    currency,
    accountId,
  } = useDesk();
  const [symbol, setSymbol] = useState(SYMBOLS[0]?.symbol || "R_100");
  const open = data?.openTrade;
  const openTrades = data?.openTrades || (open ? [open] : []);
  const statusLabel = openTrades.length ? `IN TRADE ×${openTrades.length}` : "STANDBY";

  const state = useMemo(() => {
    const by = {};
    for (const s of RF_STEPS) {
      by[s.id] = { status: "wait", message: "Not evaluated on the latest scan yet." };
    }

    const scansForSym = (data?.scans || [])
      .filter((x) => x.symbol === symbol)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const scan = scansForSym[0] || null;

    if (scan?.log && Array.isArray(scan.log)) {
      for (const l of scan.log) {
        const stage = l.stage;
        const msg = l.msg || l.message || "";
        if (stage === "dominance" || stage === "body" || stage === "body2" || stage === "score") {
          by[stage] = { status: l.status || "ok", message: msg };
        }
        // map legacy names
        if (stage === "data") by.dominance = { status: l.status || "wait", message: msg };
      }
    }

    if (scan?.setup) {
      by.setup = {
        status: "ok",
        message: `${scan.setup.side?.toUpperCase() || "?"} · score ${scan.setup.score || "—"} · ${scan.setup.story || "setup ready"}`,
      };
      by.score = {
        status: "ok",
        message: by.score?.message || `Score ${scan.setup.score}`,
      };
    }

    // Live open trade
    const ot = openTrades.find((t) => t.symbol === symbol);
    if (ot && ot.status === "open") {
      by.setup = {
        status: "ok",
        message: `OPEN ${ot.side?.toUpperCase()} entry ${ot.entry} · waiting 1m expiry`,
      };
    }

    return { by, scan, at: scan?.at };
  }, [data, symbol, openTrades]);

  const badge = (st) => {
    const s = (st || "wait").toLowerCase();
    if (s === "ok") return { t: "OK", c: "#3dd68c" };
    if (s === "fail") return { t: "FAIL", c: "#f07178" };
    return { t: "WAIT", c: "#e6c07b" };
  };

  return (
    <Layout
      scanning={scanning}
      onScan={runScan}
      onRefresh={() => load({ refresh: true })}
      statusLabel={statusLabel}
      scalpMode={scalpMode}
      onToggleScalp={toggleScalp}
      accountMode={accountMode}
      onSetAccount={setAccount}
      balance={balance}
      currency={currency}
      accountId={accountId}
    >
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Rise / Fall pipeline</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.65, fontSize: 13 }}>
        Vol 100 · 1 minute · stake 0.35 · Skill 9 pullback → takeover. Fewer trades = intentional.
      </p>

      {err && (
        <div style={{ color: "#f07178", marginBottom: 12, fontSize: 13 }}>{err}</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {SYMBOLS.map((s) => (
          <button
            key={s.symbol}
            type="button"
            onClick={() => setSymbol(s.symbol)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #243044",
              background: symbol === s.symbol ? "#1a2744" : "#121820",
              color: "#e6edf3",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {RF_STEPS.map((step) => {
          const st = state.by[step.id] || { status: "wait", message: "" };
          const b = badge(st.status);
          return (
            <div
              key={step.id}
              style={{
                border: "1px solid #243044",
                borderRadius: 12,
                padding: "12px 14px",
                background: "#0d1117",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{step.label}</div>
                <div style={{ color: b.c, fontWeight: 800, fontSize: 12 }}>{b.t}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{step.why}</div>
              <div style={{ fontSize: 13, marginTop: 8, color: statusColor(st.status) }}>
                {st.message || "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, opacity: 0.45 }}>
        Last evaluation: {state.at ? fmtTime(state.at) : "—"} · Account{" "}
        {(accountMode || "demo").toUpperCase()}
        {balance != null ? ` · ${Number(balance).toFixed(2)} ${currency || "USD"}` : ""}
      </div>
    </Layout>
  );
}
