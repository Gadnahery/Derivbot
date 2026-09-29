/** Plain-language labels so any trader can follow the system */

const STAGE_HELP = {
  auth: {
    title: "Connecting to account",
    ok: "Demo account connected and ready.",
    fail: "Could not connect to Deriv. Check API token.",
  },
  dominance: {
    title: "Market direction (4H)",
    ok: "Direction is clear — only trading with this side.",
    wait: "Waiting for a clear 4H break of structure.",
    fail: "No valid direction — no new trades.",
  },
  skill8: {
    title: "Pullback check",
    ok: "Move against bias looks like a pullback — stay with the trend.",
    wait: "Checking whether price is only pulling back.",
    fail: "Possible real reversal — skipping this setup.",
  },
  h1: {
    title: "Big institutional zone (1H)",
    ok: "Macro order-block zone is marked.",
    wait: "Looking for the large 1H zone price is drawn to.",
  },
  ob: {
    title: "Entry zone (real order block)",
    ok: "Precise order-block zone found.",
    wait: "Waiting for price to reach the real order-block zone.",
  },
  sweep1: {
    title: "First stop hunt (bait)",
    ok: "First liquidity grab seen — this is bait, not the entry.",
    wait: "Waiting for the first sweep of stops (bait).",
  },
  sweep2: {
    title: "Second shallower sweep",
    ok: "Second sweep was shallower — opposing side is tired.",
    wait: "Waiting for a second, shallower sweep.",
  },
  body1: {
    title: "Rejection candle (C1)",
    ok: "Price wicked through and closed back — failed attempt.",
    wait: "Waiting for wick through level with body closing back.",
  },
  body2: {
    title: "Confirmation candle (C2)",
    ok: "Next candle confirmed takeover — valid trigger.",
    wait: "Waiting for confirmation candle beyond C1.",
  },
  body: {
    title: "Body-close confirmation",
    wait: "Waiting for C1 + C2 confirmation sequence.",
  },
  rr: {
    title: "Reward vs risk (min 3R)",
    ok: "Target pays at least 3R to the next liquidity pool.",
    fail: "Target does not pay 3R — setup skipped.",
    wait: "Measuring distance to next liquidity pool.",
  },
  setup: {
    title: "Full setup ready",
    ok: "All filters passed — setup is valid.",
    skip: "This setup was already acted on.",
  },
  fill: {
    title: "Order sent",
    ok: "Trade opened on the demo account.",
    fail: "Broker rejected the order — paper record kept.",
  },
  mark: {
    title: "Live price update",
    ok: "Open trade marked to market (unrealized PnL updated).",
  },
  settle: {
    title: "Trade closed",
    ok: "Take-profit hit — trade won.",
    fail: "Stop-loss hit — trade lost.",
  },
  scan: {
    title: "Scanning symbol",
    start: "Reading candles and structure…",
    skip: "Paused — a trade is already open.",
    fail: "Scan error on this symbol.",
  },
  fatal: {
    title: "System error",
    fail: "Scan stopped due to an error.",
  },
};

function humanizeJournal(entry) {
  const stage = entry.stage || "scan";
  const status = entry.status || "wait";
  const help = STAGE_HELP[stage] || {};
  const title = help.title || stage;
  const canned = help[status] || help.ok || help.wait || "";
  const detail = entry.message || "";
  return {
    title,
    status,
    summary: canned || detail,
    detail: canned && detail && detail !== canned ? detail : detail,
    symbol: entry.symbol,
    at: entry.at,
  };
}

function explainSetup(setup) {
  if (!setup) return null;
  return {
    side: setup.side,
    rr: setup.rr,
    entry: setup.entry,
    sl: setup.sl,
    tp: setup.tp,
    score: setup.score,
    blurb:
      setup.side === "buy"
        ? `Buy setup aiming for ${Number(setup.rr).toFixed(1)}R — entry near ${setup.entry}, stop ${setup.sl}, target ${setup.tp}.`
        : `Sell setup aiming for ${Number(setup.rr).toFixed(1)}R — entry near ${setup.entry}, stop ${setup.sl}, target ${setup.tp}.`,
  };
}

module.exports = { STAGE_HELP, humanizeJournal, explainSetup };
