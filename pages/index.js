import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SYMBOLS = [
  { symbol: "R_75", name: "Volatility 75", chain: "gold" },
  { symbol: "R_100", name: "Volatility 100", chain: "gold" },
  { symbol: "R_50", name: "Volatility 50", chain: "gold" },
  { symbol: "BOOM500", name: "Boom 500", chain: "gold" },
  { symbol: "CRASH500", name: "Crash 500", chain: "gold" },
  { symbol: "frxEURUSD", name: "EUR/USD", chain: "forex" },
  { symbol: "frxGBPUSD", name: "GBP/USD", chain: "forex" },
  { symbol: "frxUSDJPY", name: "USD/JPY", chain: "forex" },
  { symbol: "frxAUDUSD", name: "AUD/USD", chain: "forex" },
  { symbol: "frxXAUUSD", name: "XAU/USD", chain: "gold" },
];

const PIPELINE = [
  { id: "dominance", label: "4H Dominance", tip: "Bias from break of structure" },
  { id: "skill8", label: "Skill 8 filter", tip: "Pullback vs real reversal" },
  { id: "h1", label: "1H macro OB", tip: "Institutional zone" },
  { id: "ob", label: "Real OB", tip: "Gold 5m / Forex 15m" },
  { id: "sweep1", label: "1st liquidation", tip: "Bait — do not enter" },
  { id: "sweep2", label: "2nd shallower", tip: "Opposing side exhausting" },
  { id: "body1", label: "Body-close C1", tip: "Wick through, body back" },
  { id: "body2", label: "Body-close C2", tip: "Takeover — trigger" },
  { id: "rr", label: "3R to liquidity", tip: "Next pool must pay ≥3R" },
];

const TFS = ["m1", "m5", "m15", "h1", "h4"];

function statusColor(s) {
  if (s === "ok") return "#3dd68c";
  if (s === "fail") return "#f07178";
  if (s === "wait" || s === "start") return "#e6c07b";
  if (s === "skip") return "#7aa2f7";
  return "#8899aa";
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} USD`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stageFromMessage(msg = "") {
  const m = msg.toLowerCase();
  for (const p of PIPELINE) {
    if (m.includes(p.id) || m.includes(p.label.toLowerCase().split(" ")[0])) return p.id;
  }
  if (m.includes("dominance") || m.includes("4h bos")) return "dominance";
  if (m.includes("skill 8") || m.includes("untested")) return "skill8";
  if (m.includes("macro ob") || m.includes("1h")) return "h1";
  if (m.includes("real ob") || m.includes("15m") || m.includes("5m")) return "ob";
  if (m.includes("1st") || m.includes("bait") || m.includes("liquidation")) return "sweep1";
  if (m.includes("2nd") || m.includes("shallower")) return "sweep2";
  if (m.includes("c1") || m.includes("body-close c1")) return "body1";
  if (m.includes("c2") || m.includes("trigger") || m.includes("takeover")) return "body2";
  if (m.includes("3r") || m.includes("pool") || m.includes("rr")) return "rr";
  if (m.includes("auth")) return "auth";
  return null;
}

export default function Desk() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanLive, setScanLive] = useState(null);
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState("m15");
  const [candles, setCandles] = useState([]);
  const [chartErr, setChartErr] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const chartRef = useRef(null);
  const chartApi = useRef(null);
  const seriesApi = useRef(null);
  const markersApi = useRef([]);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "status failed");
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  const loadCandles = useCallback(async (sym, timeframe) => {
    setLoadingChart(true);
    setChartErr(null);
    try {
      const r = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&tf=${timeframe}&count=180`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "candles failed");
      setCandles(j.candles || []);
    } catch (e) {
      setChartErr(e.message);
      setCandles([]);
    }
    setLoadingChart(false);
  }, []);

  async function runScan() {
    setScanning(true);
    setScanLive({ phase: "starting", at: Date.now() });
    try {
      const r = await fetch("/api/scan");
      const j = await r.json();
      setScanLive({ phase: "done", result: j, at: Date.now() });
      await loadStatus();
      await loadCandles(symbol, tf);
    } catch (e) {
      setScanLive({ phase: "error", error: e.message, at: Date.now() });
      setErr(e.message);
    }
    setScanning(false);
  }

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 8000);
    return () => clearInterval(t);
  }, [loadStatus]);

  useEffect(() => {
    loadCandles(symbol, tf);
  }, [symbol, tf, loadCandles]);

  // Chart init / update
  useEffect(() => {
    let disposed = false;
    let chart;
    async function mount() {
      if (!chartRef.current) return;
      const lc = await import("lightweight-charts");
      if (disposed) return;
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }
      chart = lc.createChart(chartRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "#0d1117" },
          textColor: "#8b9cb3",
        },
        grid: {
          vertLines: { color: "#1a2332" },
          horzLines: { color: "#1a2332" },
        },
        crosshair: { mode: lc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#1e2a3a" },
        timeScale: { borderColor: "#1e2a3a", timeVisible: true, secondsVisible: false },
        width: chartRef.current.clientWidth,
        height: 420,
      });
      const series = chart.addCandlestickSeries({
        upColor: "#3dd68c",
        downColor: "#f07178",
        borderUpColor: "#3dd68c",
        borderDownColor: "#f07178",
        wickUpColor: "#3dd68c",
        wickDownColor: "#f07178",
      });
      chartApi.current = chart;
      seriesApi.current = series;

      const onResize = () => {
        if (chartRef.current && chartApi.current) {
          chartApi.current.applyOptions({ width: chartRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", onResize);
      chartRef.current._onResize = onResize;
    }
    mount();
    return () => {
      disposed = true;
      if (chartRef.current?._onResize) {
        window.removeEventListener("resize", chartRef.current._onResize);
      }
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!seriesApi.current || !candles.length) return;
    const bars = candles
      .filter((c) => c.time && c.open != null)
      .map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    seriesApi.current.setData(bars);

    // Overlay setup from latest scan for this symbol
    const scan = (data?.scans || []).find((s) => s.symbol === symbol && (s.setup || s.has_setup));
    const setup = scan?.setup || scanLive?.result?.tradePlaced || null;
    const markers = [];
    if (setup) {
      const last = bars[bars.length - 1];
      if (last) {
        markers.push({
          time: last.time,
          position: setup.side === "buy" ? "belowBar" : "aboveBar",
          color: setup.side === "buy" ? "#3dd68c" : "#f07178",
          shape: setup.side === "buy" ? "arrowUp" : "arrowDown",
          text: `${setup.side.toUpperCase()} ${Number(setup.rr).toFixed(1)}R`,
        });
      }
      try {
        seriesApi.current.createPriceLine({
          price: Number(setup.entry),
          color: "#7aa2f7",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Entry",
        });
        seriesApi.current.createPriceLine({
          price: Number(setup.sl),
          color: "#f07178",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "SL",
        });
        seriesApi.current.createPriceLine({
          price: Number(setup.tp),
          color: "#3dd68c",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "TP",
        });
      } catch {}
    }
    // Markers from journal for this symbol
    const journalMarks = (data?.journal || [])
      .filter((j) => j.symbol === symbol && (j.stage === "sweep2" || j.stage === "body2" || j.stage === "fill"))
      .slice(0, 8);
    // lightweight-charts markers need bar times — approximate with last bars
    if (markers.length && seriesApi.current.setMarkers) {
      seriesApi.current.setMarkers(markers);
    }
    chartApi.current?.timeScale().fitContent();
  }, [candles, symbol, data, scanLive]);

  const pipelineState = useMemo(() => {
    const journal = data?.journal || [];
    const byStage = {};
    for (const p of PIPELINE) byStage[p.id] = { status: "wait", message: "Waiting…" };
    // Use most recent scan log if available
    const latestScan = (data?.scans || []).find((s) => s.symbol === symbol) || (data?.scans || [])[0];
    if (latestScan?.log && Array.isArray(latestScan.log)) {
      for (const l of latestScan.log) {
        const id = l.stage || stageFromMessage(l.msg || l.message);
        if (id && byStage[id]) {
          byStage[id] = { status: l.status || "ok", message: l.msg || l.message || l.detail || "" };
        }
      }
    }
    // Merge recent journal for symbol
    for (const j of journal.filter((x) => !x.symbol || x.symbol === symbol).slice(0, 40)) {
      const id = j.stage || stageFromMessage(j.message);
      if (id && byStage[id]) {
        byStage[id] = { status: j.status || "ok", message: j.message || "" };
      }
    }
    if (scanning) {
      for (const p of PIPELINE) {
        if (byStage[p.id].status === "wait") {
          byStage[p.id] = { status: "start", message: "Scanning…" };
          break;
        }
      }
    }
    return byStage;
  }, [data, symbol, scanning]);

  const symbolStats = useMemo(() => {
    const scans = data?.scans || [];
    const map = {};
    for (const s of SYMBOLS) {
      const recent = scans.find((x) => x.symbol === s.symbol);
      map[s.symbol] = {
        bias: recent?.bias || null,
        hasSetup: !!recent?.has_setup || !!recent?.setup,
        at: recent?.at || null,
      };
    }
    return map;
  }, [data]);

  const open = data?.openTrade;
  const trades = data?.trades || [];
  const journal = data?.journal || [];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <div style={S.brand}>STRATEGY DESK</div>
          <div style={S.sub}>
            Dominance · Sweep · Body-Close · min lot · Deriv demo
            {data?.at && <span style={{ opacity: 0.5 }}> · synced {fmtTime(data.at)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={S.pill}>
            <span style={{ ...S.dot, background: scanning ? "#e6c07b" : open ? "#f07178" : "#3dd68c" }} />
            {scanning ? "SCANNING" : open ? "IN TRADE" : "STANDBY"}
          </div>
          <button style={S.btnGhost} onClick={loadStatus}>Refresh</button>
          <button style={S.btnPrimary} onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run scan now"}
          </button>
        </div>
      </header>

      {err && <div style={S.error}>Error: {err}</div>}
      {data?.stats && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            ["Closed", data.stats.closed],
            ["Wins", data.stats.wins],
            ["Losses", data.stats.losses],
            ["Win rate", data.stats.closed ? `${(data.stats.winRate * 100).toFixed(0)}%` : "—"],
            ["Total PnL", fmtUsd(data.stats.totalPnl)],
            ["Open", data.stats.open],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 10, padding: "8px 12px", minWidth: 90 }}>
              <div style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase" }}>{k}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: k === "Total PnL" ? (Number(data.stats.totalPnl) >= 0 ? "#3dd68c" : "#f07178") : "#e8eef5" }}>{v}</div>
            </div>
          ))}
        </div>
      )}


      <div style={S.grid} className="desk-grid">
        {/* Left: symbols */}
        <aside style={S.panel}>
          <div style={S.panelTitle}>Instruments</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SYMBOLS.map((s) => {
              const st = symbolStats[s.symbol] || {};
              const active = symbol === s.symbol;
              return (
                <button
                  key={s.symbol}
                  onClick={() => setSymbol(s.symbol)}
                  style={{
                    ...S.symBtn,
                    borderColor: active ? "#3d5a80" : "transparent",
                    background: active ? "#15202b" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.5 }}>{s.chain}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11 }}>
                    <span style={{ color: st.bias === "bull" ? "#3dd68c" : st.bias === "bear" ? "#f07178" : "#667" }}>
                      {st.bias ? st.bias.toUpperCase() : "—"}
                    </span>
                    {st.hasSetup && <span style={{ color: "#e6c07b" }}>SETUP</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: chart + pipeline */}
        <main style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <section style={S.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={S.panelTitle}>
                Chart · {SYMBOLS.find((s) => s.symbol === symbol)?.name || symbol}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {TFS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTf(t)}
                    style={{
                      ...S.tfBtn,
                      background: tf === t ? "#1a7f4b" : "#15202b",
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {loadingChart && <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Loading candles…</div>}
            {chartErr && <div style={{ fontSize: 12, color: "#f07178", marginBottom: 6 }}>Chart: {chartErr}</div>}
            <div ref={chartRef} style={{ width: "100%", height: 420, borderRadius: 8, overflow: "hidden" }} />
            <div style={S.legend}>
              <span><i style={{ ...S.swatch, background: "#3dd68c" }} /> Bull</span>
              <span><i style={{ ...S.swatch, background: "#f07178" }} /> Bear</span>
              <span><i style={{ ...S.swatch, background: "#7aa2f7" }} /> Entry</span>
              <span><i style={{ ...S.swatch, background: "#f07178" }} /> SL</span>
              <span><i style={{ ...S.swatch, background: "#3dd68c" }} /> TP</span>
            </div>
          </section>

          <section style={S.panel}>
            <div style={S.panelTitle}>Strategy pipeline · {symbol}</div>
            <div style={S.pipeGrid}>
              {PIPELINE.map((p, i) => {
                const st = pipelineState[p.id] || { status: "wait", message: "" };
                return (
                  <div key={p.id} style={S.pipeCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 11, opacity: 0.5 }}>STEP {i + 1}</span>
                      <span style={{ fontSize: 11, color: statusColor(st.status), fontWeight: 700 }}>
                        {String(st.status || "wait").toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, marginTop: 4 }}>{p.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{p.tip}</div>
                    <div style={{ fontSize: 12, marginTop: 8, color: "#c5d0de", lineHeight: 1.35 }}>
                      {st.message || "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* Right: trades + journal */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {open && (
            <section style={{ ...S.panel, borderColor: Number(open.unrealized_pnl) >= 0 ? "#1a3d2a" : "#3a2040" }}>
              <div style={S.panelTitle}>Open trade · live PnL</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: Number(open.unrealized_pnl) >= 0 ? "#3dd68c" : "#f07178", marginBottom: 8 }}>
                {fmtUsd(open.unrealized_pnl)}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65 }}>
                <div><b style={{ color: open.side === "buy" ? "#3dd68c" : "#f07178" }}>{open.side?.toUpperCase()}</b> {open.symbol_name || open.symbol}</div>
                <div>Mark <b>{open.current_price != null ? Number(open.current_price).toFixed(5) : "—"}</b></div>
                <div>Entry {Number(open.entry).toFixed(5)} · SL {Number(open.sl).toFixed(5)} · TP {Number(open.tp).toFixed(5)}</div>
                <div>Stake {open.stake} · R:R {Number(open.rr).toFixed(2)} · {open.execution || "—"}</div>
                {open.contract_id && <div style={{ opacity: 0.6 }}>Contract {open.contract_id}</div>}
              </div>
            </section>
          )}

          <section style={{ ...S.panel, flex: 1 }}>
            <div style={S.panelTitle}>Trades</div>
            <div style={{ maxHeight: 220, overflow: "auto" }}>
              {trades.length === 0 && <div style={S.empty}>No trades yet</div>}
              {trades.map((t) => (
                <div key={t.id} style={S.row}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      <b style={{ color: t.side === "buy" ? "#3dd68c" : "#f07178" }}>
                        {t.side?.toUpperCase()}
                      </b>{" "}
                      {t.symbol_name || t.symbol}
                    </span>
                    <span style={{ fontSize: 11, color: statusColor(t.status) }}>{t.status}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: Number(t.status === "open" ? t.unrealized_pnl : t.pnl) >= 0 ? "#3dd68c" : "#f07178", fontWeight: 700 }}>
                      {t.status === "open" ? fmtUsd(t.unrealized_pnl) : t.pnl != null ? fmtUsd(t.pnl) : "—"}
                    </span>
                    <span style={{ opacity: 0.55 }}>{Number(t.rr).toFixed(1)}R · {fmtTime(t.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...S.panel, flex: 1.4 }}>
            <div style={S.panelTitle}>Live journal</div>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {journal.length === 0 && <div style={S.empty}>Waiting for first scan…</div>}
              {journal.map((j) => (
                <div key={j.id || j.at + j.message} style={S.row}>
                  <div style={{ fontSize: 10, opacity: 0.45 }}>{fmtTime(j.at)}</div>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: statusColor(j.status), fontWeight: 700 }}>
                      [{j.status}]
                    </span>{" "}
                    <b>{j.stage}</b>
                    {j.symbol ? ` · ${j.symbol}` : ""}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{j.message}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <footer style={S.footer}>
        Supabase cron → /api/scan every minute · Chart via Deriv candles · Strategy unchanged
        {scanLive?.phase === "done" && scanLive.result?.ms != null && (
          <span> · Last scan {scanLive.result.ms}ms</span>
        )}
      </footer>
    </div>
  );
}

const S = {
  page: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    background: "#070b10",
    color: "#e8eef5",
    minHeight: "100vh",
    padding: "16px 18px 28px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
    flexWrap: "wrap",
  },
  brand: { fontSize: 18, fontWeight: 800, letterSpacing: 1.2 },
  sub: { fontSize: 12, opacity: 0.55, marginTop: 3 },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#121820",
    border: "1px solid #1e2a3a",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
  },
  dot: { width: 8, height: 8, borderRadius: 99, display: "inline-block" },
  btnGhost: {
    background: "#121820",
    color: "#e8eef5",
    border: "1px solid #243044",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 13,
  },
  btnPrimary: {
    background: "#1a7f4b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  error: {
    background: "#2a1215",
    border: "1px solid #5a2028",
    color: "#f07178",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 13,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(180px,220px) minmax(0,1fr) minmax(260px,300px)",
    gap: 12,
    alignItems: "start",
  },
  panel: {
    background: "#0d1117",
    border: "1px solid #1a2332",
    borderRadius: 12,
    padding: 14,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.65,
    marginBottom: 10,
  },
  symBtn: {
    textAlign: "left",
    color: "#e8eef5",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 13,
  },
  tfBtn: {
    color: "#e8eef5",
    border: "1px solid #243044",
    borderRadius: 6,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  legend: {
    display: "flex",
    gap: 14,
    marginTop: 10,
    fontSize: 11,
    opacity: 0.7,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    display: "inline-block",
    marginRight: 4,
  },
  pipeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 8,
  },
  pipeCard: {
    background: "#111820",
    border: "1px solid #1c2a3a",
    borderRadius: 10,
    padding: 10,
  },
  row: {
    borderBottom: "1px solid #15202b",
    padding: "8px 0",
  },
  empty: { fontSize: 12, opacity: 0.45, padding: "8px 0" },
  footer: {
    marginTop: 16,
    fontSize: 11,
    opacity: 0.4,
  },
};

// Responsive fallback via simple media-ish note — CSS-in-JS limited; grid collapses on narrow screens via minmax
if (typeof window !== "undefined") {
  // no-op; styles are inline
}
