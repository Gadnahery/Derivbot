import Layout from "../components/Layout";
import { useDesk, fmtTime, statusColor } from "../lib/useDesk";
import { useEffect, useState } from "react";

export default function SignalsPage() {
  const { data, err, scanning, load, runScan } = useDesk();
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";
  const signals = data?.signals || [];
  const [pushState, setPushState] = useState("idle");
  const [pushMsg, setPushMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "granted") setPushState("on");
    else if (Notification.permission === "denied") setPushState("denied");
  }, []);

  async function enablePush() {
    try {
      setPushMsg("");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
        setPushMsg("This browser does not support web push.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushState("denied");
        setPushMsg("Notification permission denied.");
        return;
      }
      const vapidRes = await fetch("/api/push/subscribe");
      const { publicKey } = await vapidRes.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "subscribe failed");
      setPushState("on");
      setPushMsg("Push enabled — you will get alerts on new MT5 signals.");
    } catch (e) {
      setPushState("error");
      setPushMsg(e.message);
    }
  }

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>MT5 Signals</h1>
      <p style={{ margin: "0 0 14px", opacity: 0.55, fontSize: 13, maxWidth: 720 }}>
        Currency + gold + BTC only (no Deriv synthetics). When a full setup passes Skills 1–10 and ≥3R,
        a signal is stored here and pushed to your phone. Execute yourself on MetaTrader 5.
      </p>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Push notifications</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
          Install this site as an app (Add to Home Screen), then enable alerts.
        </div>
        <button type="button" style={btn} onClick={enablePush} disabled={pushState === "on"}>
          {pushState === "on" ? "Notifications ON" : "Enable signal alerts"}
        </button>
        {pushMsg && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{pushMsg}</div>}
        {pushState === "denied" && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#f07178" }}>
            Permission blocked — enable notifications for this site in phone settings.
          </div>
        )}
      </div>

      {err && <div style={{ color: "#f07178", marginTop: 12 }}>{err}</div>}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {signals.length === 0 && (
          <div style={{ opacity: 0.5, fontSize: 13 }}>No signals yet. Cron scans every minute.</div>
        )}
        {signals.map((s) => (
          <article key={s.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                <span style={{ color: s.side === "buy" ? "#3dd68c" : "#f07178" }}>
                  {(s.side || "").toUpperCase()}
                </span>{" "}
                {s.mt5_symbol || s.symbol_name || s.symbol}
              </div>
              <div style={{ color: "#7aa2f7", fontWeight: 800, fontSize: 18 }}>
                {s.rr != null ? `${Number(s.rr).toFixed(1)}R` : "—"}
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>{fmtTime(s.at)}</div>
            <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6 }}>
              <div>
                <b>Entry</b> {s.entry} · <b>SL</b> {s.sl} · <b>TP</b> {s.tp}
              </div>
              <div>
                <b>Bias</b> {s.bias || "—"} · <b>Score</b> {s.score ?? "—"} ·{" "}
                <span style={{ color: statusColor(s.status) }}>{s.status}</span>
                {s.notified ? " · notified" : ""}
              </div>
              <div style={{ marginTop: 6, opacity: 0.75 }}>
                MT5 symbol: <b>{s.mt5_symbol || s.symbol_name}</b> · suggested lot{" "}
                <b>{s.criteria?.mt5?.lotHint || "0.01"}</b>
              </div>
            </div>
            {s.criteria?.rules && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #1a2332" }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 6 }}>
                  WHY THIS SIGNAL (criteria)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
                  <li>{s.criteria.rules.bos}</li>
                  <li>{s.criteria.rules.dominance}</li>
                  <li>{s.criteria.rules.sweeps}</li>
                  <li>{s.criteria.rules.bodyClose}</li>
                  <li>{s.criteria.rules.minRr}</li>
                  <li>Chain: {s.criteria.chain}</li>
                </ul>
              </div>
            )}
            {Array.isArray(s.criteria?.steps) && s.criteria.steps.length > 0 && (
              <details style={{ marginTop: 10, fontSize: 12 }}>
                <summary style={{ cursor: "pointer", opacity: 0.7 }}>Pipeline steps</summary>
                <div style={{ marginTop: 6 }}>
                  {s.criteria.steps.map((st, i) => (
                    <div key={i} style={{ padding: "3px 0", borderBottom: "1px solid #15202b" }}>
                      <b style={{ color: statusColor(st.status) }}>[{st.status}]</b> {st.stage}{" "}
                      {st.tf ? `(${st.tf})` : ""} — {st.msg}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
    </Layout>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const card = {
  background: "#0d1117",
  border: "1px solid #1a2332",
  borderRadius: 12,
  padding: 14,
};
const btn = {
  background: "#1a7f4b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};
