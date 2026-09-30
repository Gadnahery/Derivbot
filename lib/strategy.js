/**
 * Exact Dominance + Sweep + Body-Close strategy (Skill 4A/4B + 8 + 9 + 10)
 * Ported for serverless single-scan cycles.
 */

const GOLD_CHAIN = {
  biasTf: "h4", realObTf: "m5", sweepSpotTf: "m5", bodyConfirmTf: "m3", entryTf: "m1",
};
const FOREX_CHAIN = {
  biasTf: "h4", realObTf: "m15", sweepSpotTf: "m15", bodyConfirmTf: "m5", entryTf: "m1",
};

const WATCHLIST = [
  // Official plan pairs only (Deriv synthetics excluded per Skill system export)
  { symbol: "frxXAUUSD", name: "XAU/USD", chain: "gold", digits: 2, mt5: "XAUUSD" },
  { symbol: "frxEURUSD", name: "EUR/USD", chain: "forex", digits: 5, mt5: "EURUSD" },
  { symbol: "frxGBPUSD", name: "GBP/USD", chain: "forex", digits: 5, mt5: "GBPUSD" },
  { symbol: "frxGBPJPY", name: "GBP/JPY", chain: "forex", digits: 3, mt5: "GBPJPY" },
  { symbol: "cryBTCUSD", name: "BTC/USD", chain: "forex", digits: 2, mt5: "BTCUSD" },
];

const MIN_RR = 3.0;
const MIN_STAKE = 1;
const MULTIPLIER = 20;

function bodyTop(c) { return Math.max(c.open, c.close); }
function bodyBot(c) { return Math.min(c.open, c.close); }
function isBull(c) { return c.close > c.open; }
function isBear(c) { return c.close < c.open; }
function bodyRatio(c) {
  const range = c.high - c.low;
  return range <= 0 ? 0 : Math.abs(c.close - c.open) / range;
}

function swings(candles, left = 2, right = 2) {
  const out = [];
  for (let i = left; i < candles.length - right; i++) {
    let isH = true, isL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isH = false;
      if (candles[j].low <= candles[i].low) isL = false;
    }
    if (isH) out.push({ index: i, epoch: candles[i].epoch, price: candles[i].high, kind: "high" });
    else if (isL) out.push({ index: i, epoch: candles[i].epoch, price: candles[i].low, kind: "low" });
  }
  return out;
}

function lastBOS(candles) {
  const sw = swings(candles, 2, 2);
  if (sw.length < 2 || candles.length < 6) return null;
  let lastHigh = null, lastLow = null, bos = null;
  const byIndex = new Map(sw.map((s) => [s.index, s]));
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (lastHigh && c.close > lastHigh.price) bos = { bias: "bull", epoch: c.epoch, level: lastHigh.price, index: i };
    if (lastLow && c.close < lastLow.price) bos = { bias: "bear", epoch: c.epoch, level: lastLow.price, index: i };
    const s = byIndex.get(i);
    if (s?.kind === "high") lastHigh = s;
    if (s?.kind === "low") lastLow = s;
  }
  return bos;
}

function atr(candles, period = 14) {
  if (candles.length < 2) return 0;
  const n = Math.min(period, candles.length - 1);
  let sum = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    const prev = candles[i - 1] ?? candles[i];
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev.close),
      Math.abs(candles[i].low - prev.close)
    );
    sum += tr;
  }
  return sum / n;
}

function nextLiquidity(candles, bias, fromPrice) {
  const sw = swings(candles, 2, 1);
  if (bias === "bear") {
    const lows = sw.filter((s) => s.kind === "low" && s.price < fromPrice);
    return lows.length ? lows[lows.length - 1].price : null;
  }
  const highs = sw.filter((s) => s.kind === "high" && s.price > fromPrice);
  return highs.length ? highs[highs.length - 1].price : null;
}

function untestedPoolsNearby(candles, bias, fromPrice, nearby) {
  const sw = swings(candles, 2, 2);
  return sw.filter((s) => {
    const after = candles.slice(s.index + 1);
    const tested = s.kind === "high" ? after.some((c) => c.high >= s.price) : after.some((c) => c.low <= s.price);
    if (tested) return false;
    if (bias === "bear") return s.kind === "high" && s.price > fromPrice && s.price - fromPrice <= nearby;
    return s.kind === "low" && s.price < fromPrice && fromPrice - s.price <= nearby;
  });
}

function findRealOB(candles, bias) {
  if (candles.length < 8) return null;
  for (let i = candles.length - 3; i >= 3; i--) {
    const c = candles[i];
    if (bias === "bear" && isBull(c)) {
      const after = candles.slice(i + 1, i + 6);
      if (after.some((a) => isBear(a) && a.close < bodyBot(c))) {
        return { top: bodyTop(c), bot: bodyBot(c), epoch: c.epoch, high: c.high, low: c.low };
      }
    }
    if (bias === "bull" && isBear(c)) {
      const after = candles.slice(i + 1, i + 6);
      if (after.some((a) => isBull(a) && a.close > bodyTop(c))) {
        return { top: bodyTop(c), bot: bodyBot(c), epoch: c.epoch, high: c.high, low: c.low };
      }
    }
  }
  return null;
}

function detectSweeps(candles, bias, level) {
  if (!candles.length || level == null) return {};
  const recent = candles.slice(-40);
  if (bias === "bear") {
    let first = null;
    for (let i = 0; i < recent.length; i++) {
      const c = recent[i];
      if (c.high > level && c.close <= level) {
        first = { extreme: c.high, epoch: c.epoch, index: i, level };
        break;
      }
    }
    if (!first) return {};
    const afterFirst = recent.slice(first.index + 1);
    if (!afterFirst.some((c) => c.close < level)) return { sweep1: first };
    for (const c of afterFirst) {
      if (c.high > level && c.close <= level && c.high < first.extreme) {
        return {
          sweep1: first,
          sweep2: {
            extreme: c.high,
            epoch: c.epoch,
            level,
            shallower: (first.extreme - c.high) / (first.extreme - level || 1),
          },
        };
      }
    }
    return { sweep1: first };
  }
  let first = null;
  for (let i = 0; i < recent.length; i++) {
    const c = recent[i];
    if (c.low < level && c.close >= level) {
      first = { extreme: c.low, epoch: c.epoch, index: i, level };
      break;
    }
  }
  if (!first) return {};
  const afterFirst = recent.slice(first.index + 1);
  if (!afterFirst.some((c) => c.close > level)) return { sweep1: first };
  for (const c of afterFirst) {
    if (c.low < level && c.close >= level && c.low > first.extreme) {
      return {
        sweep1: first,
        sweep2: {
          extreme: c.low,
          epoch: c.epoch,
          level,
          shallower: (c.low - first.extreme) / (level - first.extreme || 1),
        },
      };
    }
  }
  return { sweep1: first };
}

function bodyClose(candles, bias, sweepLevel) {
  if (candles.length < 3) return null;
  const lastFew = candles.slice(-8);
  for (let i = 1; i < lastFew.length; i++) {
    const c1 = lastFew[i - 1];
    const c2 = lastFew[i];
    if (bias === "bear") {
      if (c1.high > sweepLevel && c1.close <= sweepLevel) {
        if (isBear(c2) && c2.close < bodyBot(c1) && bodyRatio(c2) >= 0.35) return { c1, c2 };
      }
    } else {
      if (c1.low < sweepLevel && c1.close >= sweepLevel) {
        if (isBull(c2) && c2.close > bodyTop(c1) && bodyRatio(c2) >= 0.35) return { c1, c2 };
      }
    }
  }
  return null;
}

function scanSymbol(symbolInfo, frames) {
  const gold = symbolInfo.chain === "gold";
  const jobs = gold ? GOLD_CHAIN : FOREX_CHAIN;
  const digits = symbolInfo.digits;
  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(digits) : "—");
  const log = [];
  const push = (stage, status, tf, msg) => log.push({ stage, status, tf, msg });

  const h4 = frames.h4 || [];
  const h1 = frames.h1 || [];
  const m15 = frames.m15 || [];
  const m5 = frames.m5 || [];
  const m3 = frames.m3 || [];
  const m1 = frames.m1 || [];

  const h4bos = lastBOS(h4);
  if (!h4bos) {
    push("dominance", "wait", "4H", "No confirmed 4H BOS. No bias.");
    return { setup: null, log, bias: null };
  }
  const bias = h4bos.bias;
  push("dominance", "ok", "4H", bias === "bear" ? "Bearish 4H BOS — sells only." : "Bullish 4H BOS — buys only.");

  const atrH1 = atr(h1) || atr(h4) || 1;
  const lastPrice = (m1[m1.length - 1] || m5[m5.length - 1] || h1[h1.length - 1] || {}).close;
  if (lastPrice == null) {
    push("skill8", "wait", "1H", "No price yet.");
    return { setup: null, log, bias };
  }
  const untested = untestedPoolsNearby(h1.length ? h1 : h4, bias, lastPrice, atrH1 * 2.5);
  const against = m15.slice(-4).filter((c) => (bias === "bear" ? isBull(c) : isBear(c))).length >= 3;
  if (against && untested.length === 0) {
    push("skill8", "fail", "1H", "Bodies against bias + no untested liquidity — skip.");
    return { setup: null, log, bias };
  }
  push("skill8", "ok", "1H", untested.length ? "Untested liquidity nearby — stay with bias." : "Bias intact.");

  const macroOb = findRealOB(h1, bias);
  if (!macroOb) {
    push("h1", "wait", "1H", "No clear macro OB on 1H.");
    return { setup: null, log, bias };
  }
  push("h1", "ok", "1H", `Macro OB ${fmt(macroOb.bot)}–${fmt(macroOb.top)}`);

  const realObTfBars = gold ? m5 : m15;
  const realOb = findRealOB(realObTfBars, bias);
  if (!realOb) {
    push("ob", "wait", gold ? "5m" : "15m", "Waiting for real OB.");
    return { setup: null, log, bias };
  }
  push("ob", "ok", gold ? "5m" : "15m", `Real OB ${fmt(realOb.bot)}–${fmt(realOb.top)}`);

  const zonePad = atr(realObTfBars) * 0.3;
  const inZone = lastPrice >= realOb.bot - zonePad && lastPrice <= realOb.top + zonePad;
  if (!inZone) {
    push("ob", "wait", gold ? "5m" : "15m", "Price not at real OB zone yet.");
    return { setup: null, log, bias };
  }

  const sweepBars = gold ? m5 : m15;
  const sweepLevel = bias === "bear" ? realOb.top : realOb.bot;
  const { sweep1, sweep2 } = detectSweeps(sweepBars, bias, sweepLevel);
  if (!sweep1) {
    push("sweep1", "wait", jobs.sweepSpotTf, "Waiting for 1st liquidation (bait).");
    return { setup: null, log, bias };
  }
  push("sweep1", "ok", jobs.sweepSpotTf, `1st liquidation ${fmt(sweep1.extreme)} — BAIT.`);
  if (!sweep2) {
    push("sweep2", "wait", jobs.bodyConfirmTf, "Need 2nd SHALLLOWER sweep.");
    return { setup: null, log, bias };
  }
  push("sweep2", "ok", jobs.bodyConfirmTf, `2nd shallower ${fmt(sweep2.extreme)}.`);

  const bodyBars = gold ? m3 : m5;
  const bodyRes = bodyClose(bodyBars.length ? bodyBars : m1, bias, sweepLevel);
  if (!bodyRes) {
    push("body", "wait", jobs.bodyConfirmTf, "Waiting C1 + C2 body-close.");
    return { setup: null, log, bias };
  }
  const { c1, c2 } = bodyRes;
  push("body1", "ok", jobs.bodyConfirmTf, "C1: wick through, body back.");
  push("body2", "ok", "1m", "C2: body beyond C1 — TRIGGER.");

  const entry = c2.close;
  const pip = Math.pow(10, -Math.min(5, digits));
  const buffer = Math.max(atr(m1.length ? m1 : bodyBars) * 0.08, pip * 2);
  const sl = bias === "bear" ? sweep2.extreme + buffer : sweep2.extreme - buffer;
  const risk = Math.abs(entry - sl);
  if (risk <= 0) {
    push("rr", "fail", "1m", "Invalid risk.");
    return { setup: null, log, bias };
  }
  let tp = nextLiquidity(gold ? m5 : m15, bias, entry);
  if (tp == null) tp = nextLiquidity(h1, bias, entry);
  const naturalRR = tp != null ? Math.abs(entry - tp) / risk : 0;
  if (tp == null || naturalRR < MIN_RR) {
    push("rr", "fail", "1m", tp == null ? "No pool." : `Only ${naturalRR.toFixed(1)}R — need ≥${MIN_RR}R.`);
    return { setup: null, log, bias };
  }
  push("rr", "ok", "1m", `TP ${fmt(tp)} = ${naturalRR.toFixed(1)}R.`);

  return {
    setup: {
      symbol: symbolInfo.symbol,
      symbolName: symbolInfo.name,
      bias,
      side: bias === "bear" ? "sell" : "buy",
      entry,
      sl,
      tp,
      risk,
      rr: naturalRR,
      c2Epoch: c2.epoch,
      score: Math.min(99, Math.round(56 + 8 + Math.min(12, (sweep2.shallower || 0) * 24) + Math.min(10, bodyRatio(c2) * 12) + Math.min(10, (naturalRR - MIN_RR) * 3))),
    },
    log,
    bias,
  };
}

module.exports = {
  WATCHLIST,
  MIN_STAKE,
  MULTIPLIER,
  MIN_RR,
  scanSymbol,
};
