import Layout from "../components/Layout";
import { useDesk, SYMBOLS } from "../lib/useDesk";
import { useEffect, useRef, useState, useCallback } from "react";

const TFS = ["m1", "m5", "m15", "h1", "h4"];

export default function ChartPage() {
  const { data, err, scanning, load, runScan } = useDesk();
  const [symbol, setSymbol] = useState("frxEURUSD");
  const [tf, setTf] = useState("m15");
  const [candles, setCandles] = useState([]);
  const [chartErr, setChartErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);
  const chartApi = useRef(null);
  const seriesApi = useRef(null);
  const lcRef = useRef(null);
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";

  const loadCandles = useCallback(async (sym, timeframe) => {
    setLoading(true);
    setChartErr(null);
    setCandles([]);
    try {
      const r = await fetch(
        `/api/candles?symbol=${encodeURIComponent(sym)}&tf=${timeframe}&count=180`
      );
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "candles failed");
      const bars = (j.candles || [])
        .filter((c) => c && c.time && c.open != null && c.high != null && c.low != null && c.close != null)
        .map((c) => ({
          time: Number(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }))
        .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open))
        .sort((a, b) => a.time - b.time);
      // dedupe times (lightweight-charts requires unique ascending times)
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
    } catch (e) {
      setChartErr(e.message);
      setCandles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCandles(symbol, tf);
  }, [symbol, tf, loadCandles]);

  // Mount chart once
  useEffect(() => {
    let disposed = false;
    async function mount() {
      if (!chartRef.current) return;
      const lc = await import("lightweight-charts");
      if (disposed) return;
      lcRef.current = lc;
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }
      const height =
        window.innerWidth < 900
          ? Math.max(280, Math.min(360, window.innerHeight * 0.42))
          : 480;
      const chart = lc.createChart(chartRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "#0d1117" },
          textColor: "#8b9cb3",
        },
        grid: {
          vertLines: { color: "#1a2332" },
          horzLines: { color: "#1a2332" },
        },
        rightPriceScale: { borderColor: "#1e2a3a", scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: "#1e2a3a", timeVisible: true, secondsVisible: false },
        width: chartRef.current.clientWidth,
        height,
      });
      const series = chart.addCandlestickSeries({
        upColor: "#3dd68c",
        downColor: "#f07178",
        borderUpColor: "#3dd68c",
        borderDownColor: "#f07178",
        wickUpColor: "#3dd68c",
        wickDownColor: "#f07178",
        priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
      });
      chartApi.current = chart;
      seriesApi.current = series;

      const onResize = () => {
        if (chartRef.current && chartApi.current) {
          const h =
            window.innerWidth < 900
              ? Math.max(280, Math.min(360, window.innerHeight * 0.42))
              : 480;
          chartApi.current.applyOptions({
            width: chartRef.current.clientWidth,
            height: h,
          });
        }
      };
      window.addEventListener("resize", onResize);
      chartRef.current._rz = onResize;
    }
    mount();
    return () => {
      disposed = true;
      if (chartRef.current?._rz) window.removeEventListener("resize", chartRef.current._rz);
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }
      seriesApi.current = null;
    };
  }, []);

  // Push candles + overlays whenever data changes
  useEffect(() => {
    if (!chartApi.current || !lcRef.current) return;
    const lc = lcRef.current;

    // Recreate series each update so old price lines don't stick/break other symbols
    if (seriesApi.current) {
      try {
        chartApi.current.removeSeries(seriesApi.current);
      } catch {}
      seriesApi.current = null;
    }
    if (!candles.length) return;

    // Adaptive precision from price magnitude
    const sample = Math.abs(candles[candles.length - 1].close);
    let precision = 5;
    let minMove = 0.00001;
    if (sample >= 1000) {
      precision = 2;
      minMove = 0.01;
    } else if (sample >= 100) {
      precision = 3;
      minMove = 0.001;
    } else if (sample >= 10) {
      precision = 4;
      minMove = 0.0001;
    }

    const series = chartApi.current.addCandlestickSeries({
      upColor: "#3dd68c",
      downColor: "#f07178",
      borderUpColor: "#3dd68c",
      borderDownColor: "#f07178",
      wickUpColor: "#3dd68c",
      wickDownColor: "#f07178",
      priceFormat: { type: "price", precision, minMove },
    });
    seriesApi.current = series;
    series.setData(candles);

    const scan = (data?.scans || []).find((s) => s.symbol === symbol && s.setup);
    const setup =
      scan?.setup || (open && open.symbol === symbol ? open : null);

    if (setup) {
      try {
        series.createPriceLine({
          price: Number(setup.entry),
          color: "#7aa2f7",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Entry",
        });
        series.createPriceLine({
          price: Number(setup.sl),
          color: "#f07178",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "SL",
        });
        series.createPriceLine({
          price: Number(setup.tp),
          color: "#3dd68c",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "TP",
        });
        const last = candles[candles.length - 1];
        if (last && series.setMarkers) {
          series.setMarkers([
            {
              time: last.time,
              position: setup.side === "buy" ? "belowBar" : "aboveBar",
              color: setup.side === "buy" ? "#3dd68c" : "#f07178",
              shape: setup.side === "buy" ? "arrowUp" : "arrowDown",
              text: `${(setup.side || "").toUpperCase()} ${Number(setup.rr).toFixed(1)}R`,
            },
          ]);
        }
      } catch (e) {
        console.warn("overlay", e);
      }
    }

    chartApi.current.timeScale().fitContent();
  }, [candles, symbol, data, open]);

  const setup = (data?.scans || []).find((s) => s.symbol === symbol)?.setup;
  const lastClose = candles.length ? candles[candles.length - 1].close : null;

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Chart</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.55, fontSize: 13 }}>
            {SYMBOLS.find((s) => s.symbol === symbol)?.name || symbol}
            {lastClose != null ? ` · ${lastClose}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TFS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              style={{
                background: tf === t ? "#1a7f4b" : "#121820",
                color: "#fff",
                border: "1px solid #243044",
                borderRadius: 6,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {err && <div style={{ color: "#f07178", marginBottom: 8 }}>{err}</div>}

      {/* Symbol chips — horizontal scroll on mobile */}
      <div
        className="symbol-chips"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 10,
          marginBottom: 10,
        }}
      >
        {SYMBOLS.map((s) => (
          <button
            key={s.symbol}
            type="button"
            onClick={() => setSymbol(s.symbol)}
            style={{
              flex: "0 0 auto",
              background: symbol === s.symbol ? "#1a7f4b" : "#121820",
              color: "#e8eef5",
              border: "1px solid " + (symbol === s.symbol ? "#2d9d62" : "#243044"),
              borderRadius: 999,
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div
        style={{
          background: "#0d1117",
          border: "1px solid #1a2332",
          borderRadius: 12,
          padding: 12,
        }}
      >
        {setup && (
          <div style={{ marginBottom: 10, fontSize: 13 }}>
            Setup{" "}
            <b style={{ color: "#7aa2f7" }}>{Number(setup.rr).toFixed(1)}R</b>{" "}
            {setup.side?.toUpperCase()} · E {setup.entry} · SL {setup.sl} · TP{" "}
            {setup.tp}
          </div>
        )}
        {loading && (
          <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 6 }}>
            Loading candles for {symbol}…
          </div>
        )}
        {chartErr && (
          <div style={{ fontSize: 12, color: "#f07178", marginBottom: 6 }}>
            Chart: {chartErr}
          </div>
        )}
        {!loading && !chartErr && candles.length > 0 && (
          <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 6 }}>
            {candles.length} bars · {tf.toUpperCase()}
          </div>
        )}
        <div
          ref={chartRef}
          style={{ width: "100%", height: "min(480px, 50vh)", minHeight: 280 }}
        />
      </div>
    </Layout>
  );
}
