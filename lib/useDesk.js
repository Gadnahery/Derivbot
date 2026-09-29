import { useCallback, useEffect, useState } from "react";

export function useDesk(pollMs = 8000) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  const load = useCallback(async () => {
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

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/scan");
      const j = await r.json();
      setLastScan(j);
      await load();
    } catch (e) {
      setErr(e.message);
    }
    setScanning(false);
  }, [load]);

  useEffect(() => {
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { data, err, scanning, lastScan, load, runScan };
}

export function fmtUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} USD`;
}

export function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function statusColor(s) {
  if (s === "ok" || s === "won") return "#3dd68c";
  if (s === "fail" || s === "lost") return "#f07178";
  if (s === "wait" || s === "start" || s === "open") return "#e6c07b";
  if (s === "skip" || s === "paper") return "#7aa2f7";
  return "#8899aa";
}

export const SYMBOLS = [
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
