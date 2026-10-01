import Layout from "../components/Layout";
import { useDesk, SYMBOLS } from "../lib/useDesk";
import { useEffect, useRef, useState, useCallback } from "react";

const TFS = [
  { id: "m1", label: "1m" },
  { id: "m5", label: "5m" },
  { id: "m15", label: "15m" },
  { id: "h1", label: "1H" },
  { id: "h4", label: "4H" },
];

function fmtPrice(n, precision) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(precision);
}

function pricePrecision(sample) {
  const s = Math.abs(sample || 0);
  if (s >= 1000) return { precision: 2, minMove: 0.01 };
  if (s >= 100) return { precision: 3, minMove: 0.001 };
  if (s >= 10) return { precision: 4, minMove: 0.0001 };
  return { precision: 5, minMove: 0.00001 };
}

export default function ChartPage() {
  const { data, err, scanning, load, runScan, scalpMode, toggleScalp, accountMode, setAccount } = useDesk();
  const [symbol, setSymbol] = useState("R_100");
  const [tf, setTf] = useState("m15");
  const [candles, setCandles] = useState([]);
  const [chartErr, setChartErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ohlc, setOhlc] = useState(null);
  const chartRef = useRef(null);
  const chartApi = useRef(null);
  const seriesApi = useRef(null);
  const lcRef = useRef(null);
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";
  const symMeta = SYMBOLS.find((s) => s.symbol === symbol);

  const loadCandles = useCallback(async (sym, timeframe) => {
    setLoading(true);
    setChartErr(null);
    try {
      const r = await fetch(
        `/api/candles?symbol=${encodeURIComponent(sym)}&tf=${timeframe}&count=220`
      );
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "candles failed");
      const bars = (j.candles || [])
        .filter((c) => c && c.time && c.open != null)
        .map((c) => ({
          time: Number(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }))
        .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open))
        .sort((a, b) => a.time - b.time);
      const dedup = [];
      let lastT = -1;
      for (const b of bars) {
        if (b.time > lastT) {
          dedup.push(b);
          lastT = b.time;
        }
      }
      if (!dedup.length) throw new Error(`No candle data for ${sym}`);
      setCandles(dedup);
      const last = dedup[dedup.length - 1];
      setOhlc({
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        time: last.time,
        live: true,
      });
    } catch (e) {
      setChartErr(e.message);
      setCandles([]);
      setOhlc(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCandles(symbol, tf);
  }, [symbol, tf, loadCandles]);

  // Mount chart once — TradingView-like options
  useEffect(() => {
    let disposed = false;
    let ro;
    async function mount() {
      if (!chartRef.current) return;
      const lc = await import("lightweight-charts");
      if (disposed) return;
      lcRef.current = lc;
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }

      const isMobile = window.innerWidth < 900;
      const height = isMobile
        ? Math.max(320, Math.min(440, window.innerHeight * 0.52))
        : Math.max(480, Math.min(620, window.innerHeight * 0.62));

      const chart = lc.createChart(chartRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "#131722" },
          textColor: "#d1d4dc",
          fontSize: 12,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        },
        grid: {
          vertLines: { color: "rgba(42, 46, 57, 0.6)" },
          horzLines: { color: "rgba(42, 46, 57, 0.6)" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: {
            color: "rgba(224, 227, 235, 0.35)",
            width: 1,
            style: lc.LineStyle.LargeDashed,
            labelBackgroundColor: "#2a2e39",
          },
          horzLine: {
            color: "rgba(224, 227, 235, 0.35)",
            width: 1,
            style: lc.LineStyle.LargeDashed,
            labelBackgroundColor: "#2a2e39",
          },
        },
        rightPriceScale: {
          borderColor: "#2a2e39",
          scaleMargins: { top: 0.08, bottom: 0.12 },
          entireTextOnly: false,
        },
        timeScale: {
          borderColor: "#2a2e39",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
          barSpacing: isMobile ? 7 : 9,
          minBarSpacing: 3,
          fixLeftEdge: false,
          lockVisibleTimeRangeOnResize: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: { time: true, price: true },
          axisDoubleClickReset: true,
          mouseWheel: true,
          pinch: true,
        },
        kineticScroll: {
          touch: true,
          mouse: false,
        },
        width: chartRef.current.clientWidth,
        height,
      });

      // Watermark (symbol) — TV style
      try {
        chart.applyOptions({
          watermark: {
            visible: true,
            text: "STRATEGY DESK",
            fontSize: isMobile ? 28 : 42,
            color: "rgba(120, 123, 134, 0.12)",
            horzAlign: "center",
            vertAlign: "center",
          },
        });
      } catch {
        /* v4 may use different watermark API */
      }

      const series = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineColor: "rgba(120, 123, 134, 0.5)",
        priceLineStyle: lc.LineStyle.Dashed,
      });

      chartApi.current = chart;
      seriesApi.current = series;

      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time || !param.seriesData) {
          const bars = seriesApi.current?._lastBars;
          if (bars?.length) {
            const last = bars[bars.length - 1];
            setOhlc({
              open: last.open,
              high: last.high,
              low: last.low,
              close: last.close,
              time: last.time,
              live: true,
            });
          }
          return;
        }
        const bar = param.seriesData.get(series);
        if (bar) {
          setOhlc({
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            time: param.time,
            live: false,
          });
        }
      });

      const applySize = () => {
        if (!chartRef.current || !chartApi.current) return;
        const mobile = window.innerWidth < 900;
        const h = mobile
          ? Math.max(320, Math.min(440, window.innerHeight * 0.52))
          : Math.max(480, Math.min(620, window.innerHeight * 0.62));
        chartApi.current.applyOptions({
          width: chartRef.current.clientWidth,
          height: h,
          timeScale: { barSpacing: mobile ? 7 : 9 },
        });
      };
      window.addEventListener("resize", applySize);
      chartRef.current._rz = applySize;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(applySize);
        ro.observe(chartRef.current);
      }
    }
    mount();
    return () => {
      disposed = true;
      if (chartRef.current?._rz) window.removeEventListener("resize", chartRef.current._rz);
      if (ro) ro.disconnect();
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }
      seriesApi.current = null;
    };
  }, []);

  // Data + overlays
  useEffect(() => {
    if (!chartApi.current || !lcRef.current || !candles.length) return;
    const lc = lcRef.current;

    if (seriesApi.current) {
      try {
        chartApi.current.removeSeries(seriesApi.current);
      } catch {}
      seriesApi.current = null;
    }

    const sample = Math.abs(candles[candles.length - 1].close);
    const { precision, minMove } = pricePrecision(sample);

    const series = chartApi.current.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: "rgba(120, 123, 134, 0.55)",
      priceLineStyle: lc.LineStyle.Dashed,
      priceFormat: { type: "price", precision, minMove },
    });
    seriesApi.current = series;
    series._lastBars = candles;
    series.setData(candles);

    // Watermark text update
    try {
      chartApi.current.applyOptions({
        watermark: {
          visible: true,
          text: (symMeta?.name || symbol).toUpperCase(),
          fontSize: window.innerWidth < 900 ? 26 : 40,
          color: "rgba(120, 123, 134, 0.14)",
          horzAlign: "center",
          vertAlign: "center",
        },
      });
    } catch {}

    const scan = (data?.scans || []).find((s) => s.symbol === symbol && s.setup);
    const setup =
      scan?.setup || (open && open.symbol === symbol ? open : null);

    if (setup) {
      try {
        series.createPriceLine({
          price: Number(setup.entry),
          color: "#2962ff",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Entry",
        });
        series.createPriceLine({
          price: Number(setup.sl),
          color: "#ef5350",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "SL",
        });
        series.createPriceLine({
          price: Number(setup.tp),
          color: "#26a69a",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "TP",
        });
      } catch {}
    }

    const trades = (data?.trades || []).filter((tr) => tr.symbol === symbol);
    const markers = [];
    for (const tr of trades.slice(0, 12)) {
      let tsec = null;
      try {
        tsec = Math.floor(new Date(tr.at).getTime() / 1000);
      } catch {}
      if (!tsec) continue;
      let nearest = candles[0].time;
      let best = Math.abs(candles[0].time - tsec);
      for (const c of candles) {
        const d = Math.abs(c.time - tsec);
        if (d < best) {
          best = d;
          nearest = c.time;
        }
      }
      const won = tr.status === "won";
      const lost = tr.status === "lost";
      markers.push({
        time: nearest,
        position: tr.side === "buy" ? "belowBar" : "aboveBar",
        color: won ? "#26a69a" : lost ? "#ef5350" : "#f0b90b",
        shape: tr.side === "buy" ? "arrowUp" : "arrowDown",
        text: `${(tr.side || "").toUpperCase()} ${
          tr.rr != null ? Number(tr.rr).toFixed(1) + "R" : ""
        } ${tr.status || ""}`.trim(),
      });
    }
    if (setup && !trades.some((t) => t.status === "open" && t.symbol === symbol)) {
      const last = candles[candles.length - 1];
      if (last) {
        markers.push({
          time: last.time,
          position: setup.side === "buy" ? "belowBar" : "aboveBar",
          color: setup.side === "buy" ? "#26a69a" : "#ef5350",
          shape: setup.side === "buy" ? "arrowUp" : "arrowDown",
          text: `${(setup.side || "").toUpperCase()} ${Number(setup.rr).toFixed(1)}R`,
        });
      }
    }
    if (markers.length && series.setMarkers) {
      try {
        series.setMarkers(markers.sort((a, b) => a.time - b.time));
      } catch {}
    }

    chartApi.current.timeScale().fitContent();
  }, [candles, symbol, data, open, symMeta]);

  function zoomIn() {
    if (!chartApi.current) return;
    const ts = chartApi.current.timeScale();
    const spacing = ts.options().barSpacing || 8;
    ts.applyOptions({ barSpacing: Math.min(24, spacing + 2) });
  }
  function zoomOut() {
    if (!chartApi.current) return;
    const ts = chartApi.current.timeScale();
    const spacing = ts.options().barSpacing || 8;
    ts.applyOptions({ barSpacing: Math.max(3, spacing - 2) });
  }
  function fitAll() {
    chartApi.current?.timeScale().fitContent();
  }
  function goLive() {
    if (!chartApi.current || !candles.length) return;
    chartApi.current.timeScale().scrollToRealTime();
  }

  const setup = (data?.scans || []).find((s) => s.symbol === symbol)?.setup;
  const prec = pricePrecision(ohlc?.close || candles[candles.length - 1]?.close || 1).precision;
  const chg =
    ohlc && ohlc.open
      ? ((ohlc.close - ohlc.open) / ohlc.open) * 100
      : null;

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel} scalpMode={scalpMode} onToggleScalp={toggleScalp} accountMode={accountMode} onSetAccount={setAccount}>
      {/* TV-style top legend */}
      <div style={S.legendBar}>
        <div style={{ minWidth: 0 }}>
          <div style={S.symTitle}>
            {symMeta?.name || symbol}
            <span style={S.tfBadge}>{tf.toUpperCase()}</span>
          </div>
          {ohlc && (
            <div style={S.ohlcRow}>
              <span>
                O <b>{fmtPrice(ohlc.open, prec)}</b>
              </span>
              <span>
                H <b style={{ color: "#26a69a" }}>{fmtPrice(ohlc.high, prec)}</b>
              </span>
              <span>
                L <b style={{ color: "#ef5350" }}>{fmtPrice(ohlc.low, prec)}</b>
              </span>
              <span>
                C{" "}
                <b style={{ color: chg != null && chg >= 0 ? "#26a69a" : "#ef5350" }}>
                  {fmtPrice(ohlc.close, prec)}
                </b>
              </span>
              {chg != null && (
                <span style={{ color: chg >= 0 ? "#26a69a" : "#ef5350", fontWeight: 700 }}>
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(2)}%
                </span>
              )}
              {ohlc.live && <span style={S.liveDot}>LIVE</span>}
            </div>
          )}
        </div>
        <div style={S.tools}>
          <button type="button" style={S.toolBtn} onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button type="button" style={S.toolBtn} onClick={zoomIn} title="Zoom in">
            +
          </button>
          <button type="button" style={S.toolBtn} onClick={fitAll} title="Fit">
            ⛶
          </button>
          <button type="button" style={S.toolBtn} onClick={goLive} title="Go to latest">
            ▶
          </button>
        </div>
      </div>

      {err && <div style={{ color: "#ef5350", marginBottom: 8, fontSize: 13 }}>{err}</div>}

      {/* Timeframes — TV resolution bar */}
      <div style={S.tfRow}>
        {TFS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTf(t.id)}
            style={{
              ...S.tfBtn,
              background: tf === t.id ? "#2962ff" : "transparent",
              color: tf === t.id ? "#fff" : "#b2b5be",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Symbols */}
      <div style={S.chipRow} className="symbol-chips">
        {SYMBOLS.map((s) => (
          <button
            key={s.symbol}
            type="button"
            onClick={() => setSymbol(s.symbol)}
            style={{
              ...S.chip,
              background: symbol === s.symbol ? "#1e222d" : "transparent",
              borderColor: symbol === s.symbol ? "#2962ff" : "#2a2e39",
              color: symbol === s.symbol ? "#fff" : "#b2b5be",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div style={S.chartCard}>
        {setup && (
          <div style={S.setupLine}>
            Setup{" "}
            <b style={{ color: "#2962ff" }}>{Number(setup.rr).toFixed(1)}R</b>{" "}
            {(setup.side || "").toUpperCase()} · E {setup.entry} · SL {setup.sl} · TP{" "}
            {setup.tp}
          </div>
        )}
        {loading && <div style={S.hint}>Loading {symMeta?.name || symbol}…</div>}
        {chartErr && <div style={{ ...S.hint, color: "#ef5350" }}>{chartErr}</div>}
        <div ref={chartRef} style={{ width: "100%", minHeight: 320 }} />
        <div style={S.hintBar}>
          Pinch or scroll to zoom · Drag to pan · Tap chart for OHLC · + / − buttons
        </div>
      </div>
    </Layout>
  );
}

const S = {
  legendBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  symTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#d1d4dc",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tfBadge: {
    fontSize: 11,
    fontWeight: 700,
    background: "#2a2e39",
    color: "#b2b5be",
    padding: "2px 8px",
    borderRadius: 4,
  },
  ohlcRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 12px",
    marginTop: 6,
    fontSize: 12,
    color: "#b2b5be",
  },
  liveDot: {
    fontSize: 10,
    fontWeight: 800,
    color: "#26a69a",
    letterSpacing: 0.6,
  },
  tools: { display: "flex", gap: 6 },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    border: "1px solid #2a2e39",
    background: "#1e222d",
    color: "#d1d4dc",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  tfRow: {
    display: "flex",
    gap: 2,
    background: "#1e222d",
    borderRadius: 8,
    padding: 4,
    marginBottom: 10,
    overflowX: "auto",
  },
  tfBtn: {
    flex: "1 0 auto",
    minWidth: 48,
    border: "none",
    borderRadius: 6,
    padding: "10px 8px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  chipRow: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: 8,
    marginBottom: 8,
  },
  chip: {
    flex: "0 0 auto",
    border: "1px solid #2a2e39",
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "transparent",
  },
  chartCard: {
    background: "#131722",
    border: "1px solid #2a2e39",
    borderRadius: 10,
    padding: "8px 4px 4px",
    overflow: "hidden",
  },
  setupLine: {
    fontSize: 12,
    color: "#b2b5be",
    padding: "4px 10px 8px",
  },
  hint: {
    fontSize: 12,
    color: "#787b86",
    padding: "0 10px 6px",
  },
  hintBar: {
    fontSize: 10,
    color: "#787b86",
    textAlign: "center",
    padding: "6px 8px 8px",
  },
};
