import { useCallback, useEffect, useState } from "react";

const SCALP_KEY = "stratdesk_scalp";

export function useDesk(pollMs = 8000) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [scalpMode, setScalpMode] = useState(false);

  useEffect(() => {
    try {
      setScalpMode(localStorage.getItem(SCALP_KEY) === "1");
    } catch {}
  }, []);

  const toggleScalp = useCallback(() => {
    setScalpMode((v) => {
      const next = !v;
      try {
        localStorage.setItem(SCALP_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

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

  const runScan = useCallback(async (modeOverride) => {
    setScanning(true);
    try {
      const mode = modeOverride || (scalpMode ? "scalp" : "standard");
      const q = mode === "scalp" ? "?mode=scalp" : "";
      const r = await fetch("/api/scan" + q);
      const j = await r.json();
      setLastScan(j);
      await load();
    } catch (e) {
      setErr(e.message);
    }
    setScanning(false);
  }, [load, scalpMode]);

  useEffect(() => {
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { data, err, scanning, lastScan, load, runScan, scalpMode, toggleScalp };
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
  { symbol: "frxXAUUSD", name: "XAU/USD", chain: "gold", mt5: "XAUUSD" },
  { symbol: "frxEURUSD", name: "EUR/USD", chain: "forex", mt5: "EURUSD" },
  { symbol: "frxGBPUSD", name: "GBP/USD", chain: "forex", mt5: "GBPUSD" },
  { symbol: "frxGBPJPY", name: "GBP/JPY", chain: "forex", mt5: "GBPJPY" },
  { symbol: "cryBTCUSD", name: "BTC/USD", chain: "forex", mt5: "BTCUSD" },
];
