import Layout from "../components/Layout";
import { useDesk, SYMBOLS, fmtTime } from "../lib/useDesk";
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
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";

  const loadCandles = useCallback(async (sym, timeframe) => {
    setLoading(true);
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
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCandles(symbol, tf);
  }, [symbol, tf, loadCandles]);

  useEffect(() => {
    let disposed = false;
    async function mount() {
      if (!chartRef.current) return;
      const lc = await import("lightweight-charts");
      if (disposed) return;
      if (chartApi.current) {
        chartApi.current.remove();
        chartApi.current = null;
      }
      const chart = lc.createChart(chartRef.current, {
        layout: { background: { type: lc.ColorType.Solid, color: "#0d1117" }, textColor: "#8b9cb3" },
        grid: { vertLines: { color: "#1a2332" }, horzLines: { color: "#1a2332" } },
        rightPriceScale: { borderColor: "#1e2a3a" },
        timeScale: { borderColor: "#1e2a3a", timeVisible: true },
        width: chartRef.current.clientWidth,
        height: 480,
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
    };
  }, []);

  useEffect(() => {
    if (!seriesApi.current || !candles.length) return;
    const bars = candles.filter((c) => c.time && c.open != null).map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesApi.current.setData(bars);

    const scan = (data?.scans || []).find((s) => s.symbol === symbol && s.setup);
    const setup = scan?.setup || (open && open.symbol === symbol ? open : null);
    if (setup && seriesApi.current) {
      const last = bars[bars.length - 1];
      try {
        seriesApi.current.createPriceLine({ price: Number(setup.entry), color: "#7aa2f7", lineWidth: 1, lineStyle: 2, title: "Entry" });
        seriesApi.current.createPriceLine({ price: Number(setup.sl), color: "#f07178", lineWidth: 1, lineStyle: 2, title: "SL" });
        seriesApi.current.createPriceLine({ price: Number(setup.tp), color: "#3dd68c", lineWidth: 1, lineStyle: 2, title: "TP" });
      } catch {}
      if (last && seriesApi.current.setMarkers) {
        seriesApi.current.setMarkers([
          {
            time: last.time,
            position: setup.side === "buy" ? "belowBar" : "aboveBar",
            color: setup.side === "buy" ? "#3dd68c" : "#f07178",
            shape: setup.side === "buy" ? "arrowUp" : "arrowDown",
            text: `${(setup.side || "").toUpperCase()} ${Number(setup.rr).toFixed(1)}R`,
          },
        ]);
      }
    }
    chartApi.current?.timeScale().fitContent();
  }, [candles, symbol, data, open]);

  const setup = (data?.scans || []).find((s) => s.symbol === symbol)?.setup;

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Chart</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.55, fontSize: 13 }}>Candles from Deriv · levels from last stored setup</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {TFS.map((t) => (
            <button key={t} onClick={() => setTf(t)} style={{ background: tf === t ? "#1a7f4b" : "#121820", color: "#fff", border: "1px solid #243044", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {err && <div style={{ color: "#f07178", marginBottom: 8 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
        <div style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 10 }}>
          {SYMBOLS.map((s) => (
            <button
              key={s.symbol}
              onClick={() => setSymbol(s.symbol)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: symbol === s.symbol ? "#15202b" : "transparent",
                color: "#e8eef5",
                border: "1px solid " + (symbol === s.symbol ? "#3d5a80" : "transparent"),
                borderRadius: 8,
                padding: "8px 10px",
                cursor: "pointer",
                marginBottom: 4,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 10, opacity: 0.45 }}>{s.chain}</div>
            </button>
          ))}
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 12 }}>
          {setup && (
            <div style={{ marginBottom: 10, fontSize: 13 }}>
              Setup{" "}
              <b style={{ color: "#7aa2f7" }}>{Number(setup.rr).toFixed(1)}R</b>{" "}
              {setup.side?.toUpperCase()} · E {setup.entry} · SL {setup.sl} · TP {setup.tp}
            </div>
          )}
          {loading && <div style={{ fontSize: 12, opacity: 0.5 }}>Loading candles…</div>}
          {chartErr && <div style={{ fontSize: 12, color: "#f07178" }}>Chart: {chartErr}</div>}
          <div ref={chartRef} style={{ width: "100%", height: 480 }} />
        </div>
      </div>
    </Layout>
  );
}
