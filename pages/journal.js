import Layout from "../components/Layout";
import { useDesk, fmtTime, statusColor } from "../lib/useDesk";

const HELP = {
  auth: { title: "Connecting to account", ok: "Demo account connected and ready.", fail: "Could not connect to Deriv." },
  dominance: { title: "Market direction (4H)", ok: "Direction is clear — only trading with this side.", wait: "Waiting for a clear 4H direction.", fail: "No valid direction." },
  skill8: { title: "Pullback check", ok: "Looks like a pullback — stay with the trend.", fail: "Possible reversal — skip." },
  h1: { title: "Big institutional zone (1H)", ok: "Macro zone marked.", wait: "Looking for the 1H zone." },
  ob: { title: "Entry zone (order block)", ok: "Precise entry zone found.", wait: "Waiting for price in the zone." },
  sweep1: { title: "First stop hunt (bait)", ok: "First sweep seen — bait only, no entry.", wait: "Waiting for first sweep." },
  sweep2: { title: "Second shallower sweep", ok: "Second sweep shallower — other side exhausted.", wait: "Waiting for second shallower sweep." },
  body1: { title: "Rejection candle (C1)", ok: "Wick through and close back — failed push.", wait: "Waiting for rejection candle." },
  body2: { title: "Confirmation (C2)", ok: "Confirmation printed — valid trigger.", wait: "Waiting for confirmation candle." },
  body: { title: "Body-close confirmation", wait: "Waiting for C1 + C2." },
  rr: { title: "Reward vs risk (min 3R)", ok: "Target pays at least 3R.", fail: "Under 3R — skipped.", wait: "Measuring target distance." },
  setup: { title: "Full setup", ok: "All filters passed.", skip: "Already acted on this setup." },
  fill: { title: "Order", ok: "Trade opened on demo.", fail: "Broker rejected — paper record kept." },
  mark: { title: "Live price update", ok: "Open trade marked to market." },
  settle: { title: "Trade closed", ok: "Take-profit hit.", fail: "Stop-loss hit." },
  scan: { title: "Reading this symbol", start: "Loading candles and structure…", skip: "Paused — a trade is already open.", fail: "Could not read this symbol." },
  fatal: { title: "System error", fail: "Scan stopped due to an error." },
};

function human(entry) {
  const help = HELP[entry.stage] || {};
  return {
    title: help.title || entry.stage || "Event",
    status: entry.status,
    summary: help[entry.status] || entry.message || "",
    detail: entry.message || "",
    symbol: entry.symbol,
    at: entry.at,
  };
}

export default function JournalPage() {
  const { data, err, scanning, load, runScan, scalpMode, toggleScalp } = useDesk();
  const open = data?.openTrade;
  const statusLabel = open ? "IN TRADE" : "STANDBY";
  const journal = data?.journal || [];

  return (
    <Layout scanning={scanning} onScan={runScan} onRefresh={load} statusLabel={statusLabel} scalpMode={scalpMode} onToggleScalp={toggleScalp}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Activity</h1>
      <p style={{ margin: "0 0 16px", opacity: 0.55, fontSize: 13, maxWidth: 720 }}>
        Plain-language feed. “Reading this symbol” means the bot is checking structure — not that it entered a trade.
      </p>
      {err && <div style={{ color: "#f07178" }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {journal.map((j) => {
          const h = human(j);
          return (
            <div key={j.id} style={{ background: "#0d1117", border: "1px solid #1a2332", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{h.title}</div>
                <div style={{ color: statusColor(h.status), fontWeight: 800, fontSize: 12 }}>{String(h.status || "").toUpperCase()}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.45, marginTop: 4 }}>
                {fmtTime(h.at)}{h.symbol ? ` · ${h.symbol}` : ""}
              </div>
              <div style={{ fontSize: 14, marginTop: 8 }}>{h.summary}</div>
              {h.detail && h.detail !== h.summary && (
                <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>{h.detail}</div>
              )}
            </div>
          );
        })}
        {journal.length === 0 && <div style={{ opacity: 0.5 }}>No activity yet.</div>}
      </div>
    </Layout>
  );
}
