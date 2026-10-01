import { useCallback, useEffect, useState } from "react";

const SCALP_KEY = "stratdesk_scalp";

export function useDesk(pollMs = 8000) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [scalpMode, setScalpMode] = useState(false);
  const [accountMode, setAccountMode] = useState("demo");

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

  const setAccount = useCallback(async (mode) => {
    const m = mode === "live" ? "live" : "demo";
    setAccountMode(m);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountMode: m }),
      });
    } catch {}
  }, []);

  const load = useCallback(async (opts = {}) => {
    try {
      const q = opts.refresh ? "?refresh=1" : "";
      const r = await fetch("/api/status" + q);
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
      const r = await fetch("/api/scan?account=" + encodeURIComponent(accountMode));
      const j = await r.json();
      setLastScan(j);
      await load({ refresh: true });
    } catch (e) {
      setErr(e.message);
    }
    setScanning(false);
  }, [load, accountMode]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j?.accountMode === "live" || j?.accountMode === "demo") setAccountMode(j.accountMode);
      })
      .catch(() => {});
    load({ refresh: true });
    const t = setInterval(() => load(), pollMs);
    // full balance refresh every ~45s
    const t2 = setInterval(() => load({ refresh: true }), Math.max(pollMs * 4, 45000));
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [load, pollMs]);

  const acct = data?.account || {};
  return {
    data,
    err,
    scanning,
    lastScan,
    load,
    runScan,
    scalpMode,
    toggleScalp,
    accountMode,
    setAccount,
    balance: acct.balance ?? data?.balance ?? null,
    currency: acct.currency ?? data?.currency ?? "USD",
    accountId: acct.loginid ?? data?.loginid ?? null,
  };
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
  { symbol: "R_100", name: "Vol 100", chain: "synth", mt5: "R_100" },
  { symbol: "R_50", name: "Vol 50", chain: "synth", mt5: "R_50" },
];
