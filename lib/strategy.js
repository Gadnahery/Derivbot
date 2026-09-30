/**
 * Gadna SMC/ICT system — Skills 1–10 core (+ 9 refinements)
 * Philosophy: every candle is a fight. Body = who won. Wick = who tried and failed.
 * Chains from Skill 4A (XAU) / 4B (FX/BTC). Min 3R. Official pairs only.
 * Modes: standard (plan chains) | scalp (compressed LTF, still same rules).
 */

const GOLD_CHAIN = {
  biasTf: "h4",
  realObTf: "m5",
  sweepSpotTf: "m5",
  bodyConfirmTf: "m3",
  entryTf: "m1",
};
const FOREX_CHAIN = {
  biasTf: "h4",
  realObTf: "m15",
  sweepSpotTf: "m15",
  bodyConfirmTf: "m5",
  entryTf: "m1",
};
/** Scalp mode — same buyer/seller logic, faster frames (Skill 11/12 spirit, fixed risk still min 3R) */
const GOLD_SCALP = {
  biasTf: "h1",
  realObTf: "m3",
  sweepSpotTf: "m3",
  bodyConfirmTf: "m1",
  entryTf: "m1",
};
const FOREX_SCALP = {
  biasTf: "h1",
  realObTf: "m5",
  sweepSpotTf: "m5",
  bodyConfirmTf: "m1",
  entryTf: "m1",
};

const WATCHLIST = [
  { symbol: "frxXAUUSD", name: "XAU/USD", chain: "gold", digits: 2, mt5: "XAUUSD" },
  { symbol: "frxEURUSD", name: "EUR/USD", chain: "forex", digits: 5, mt5: "EURUSD" },
  { symbol: "frxGBPUSD", name: "GBP/USD", chain: "forex", digits: 5, mt5: "GBPUSD" },
  { symbol: "frxGBPJPY", name: "GBP/JPY", chain: "forex", digits: 3, mt5: "GBPJPY" },
  { symbol: "cryBTCUSD", name: "BTC/USD", chain: "forex", digits: 2, mt5: "BTCUSD" },
];

const MIN_RR = 3.0;
const MIN_STAKE = 1;
const MULTIPLIER = 100;

// ─── Candle primitives (Skill 9) ───────────────────────────────────────────
function bodyTop(c) {
  return Math.max(c.open, c.close);
}
function bodyBot(c) {
  return Math.min(c.open, c.close);
}
function isBull(c) {
  return c.close > c.open;
}
function isBear(c) {
  return c.close < c.open;
}
function range(c) {
  return Math.max(1e-12, c.high - c.low);
}
function bodySize(c) {
  return Math.abs(c.close - c.open);
}
function bodyRatio(c) {
  return bodySize(c) / range(c);
}
/** Upper wick = buyers tried and failed (or sellers rejected higher prices) */
function upperWick(c) {
  return c.high - bodyTop(c);
}
/** Lower wick = sellers tried and failed (or buyers rejected lower prices) */
function lowerWick(c) {
  return bodyBot(c) - c.low;
}
function atr(candles, n = 14) {
  if (!candles?.length) return 0;
  const slice = candles.slice(-Math.min(n, candles.length));
  let s = 0;
  for (const c of slice) s += c.high - c.low;
  return s / slice.length;
}

function swings(candles, left = 2, right = 2) {
  const out = [];
  for (let i = left; i < candles.length - right; i++) {
    let isH = true;
    let isL = true;
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

/**
 * Skill 1 — BOS: body close beyond prior swing only (wicks do not count).
 * Body close = settled outcome. Wick = attempt.
 */
function lastBOS(candles) {
  const sw = swings(candles, 2, 2);
  if (sw.length < 2 || candles.length < 6) return null;
  let lastHigh = null;
  let lastLow = null;
  let bos = null;
  const byIndex = new Map(sw.map((s) => [s.index, s]));
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    // Body close beyond swing — not wick
    if (lastHigh && c.close > lastHigh.price) {
      bos = { bias: "bull", epoch: c.epoch, level: lastHigh.price, index: i, reason: "Buyers closed body above prior swing high — BOS bull" };
    }
    if (lastLow && c.close < lastLow.price) {
      bos = { bias: "bear", epoch: c.epoch, level: lastLow.price, index: i, reason: "Sellers closed body below prior swing low — BOS bear" };
    }
    const s = byIndex.get(i);
    if (s?.kind === "high") lastHigh = s;
    if (s?.kind === "low") lastLow = s;
  }
  return bos;
}

/** Skill 2 — Order block: last opposing candle before the impulse that caused BOS */
function findOB(candles, bias, bosIndex) {
  if (!candles?.length || bosIndex == null) return null;
  const start = Math.max(0, bosIndex - 40);
  if (bias === "bull") {
    for (let i = bosIndex - 1; i >= start; i--) {
      if (isBear(candles[i])) {
        const c = candles[i];
        return {
          top: c.high,
          bot: c.low,
          bodyTop: bodyTop(c),
          bodyBot: bodyBot(c),
          epoch: c.epoch,
          index: i,
          kind: "buy_ob",
          note: "Last bearish candle before bullish break — sellers' last territory before they lost control",
        };
      }
    }
  } else {
    for (let i = bosIndex - 1; i >= start; i--) {
      if (isBull(candles[i])) {
        const c = candles[i];
        return {
          top: c.high,
          bot: c.low,
          bodyTop: bodyTop(c),
          bodyBot: bodyBot(c),
          epoch: c.epoch,
          index: i,
          kind: "sell_ob",
          note: "Last bullish candle before bearish break — buyers' last territory before they lost control",
        };
      }
    }
  }
  return null;
}

/** Skill 3 — Live vs consumed: has a wick already tagged the zone? */
function zoneState(candles, ob, afterIndex) {
  if (!ob || !candles?.length) return "unknown";
  let touched = false;
  for (let i = (afterIndex ?? ob.index) + 1; i < candles.length; i++) {
    const c = candles[i];
    if (c.low <= ob.top && c.high >= ob.bot) touched = true;
  }
  return touched ? "consumed" : "live";
}

/**
 * Skill 9 — Seller takeover (two-step):
 * C1: buyers wick above a level / prior body but body closes back (attempt fails)
 * C2: next body closes below C1 body (sellers confirm control)
 * Buyer takeover = mirror.
 */
function sellerTakeover(c1, c2, level) {
  if (!c1 || !c2) return false;
  const wickAbove = c1.high > level && c1.close < level;
  const bodyFail = isBear(c1) || (c1.close < bodyTop(c1) && upperWick(c1) > bodySize(c1) * 0.5);
  const confirm = c2.close < bodyBot(c1);
  return (wickAbove || bodyFail) && confirm;
}
function buyerTakeover(c1, c2, level) {
  if (!c1 || !c2) return false;
  const wickBelow = c1.low < level && c1.close > level;
  const bodyFail = isBull(c1) || (c1.close > bodyBot(c1) && lowerWick(c1) > bodySize(c1) * 0.5);
  const confirm = c2.close > bodyTop(c1);
  return (wickBelow || bodyFail) && confirm;
}

/** Skill 9 refinement — instant overrun: next body closes beyond prior open (erases bounce) */
function instantOverrun(prior, next, bias) {
  if (!prior || !next) return false;
  if (bias === "bull") return next.close > prior.open && isBull(next);
  return next.close < prior.open && isBear(next);
}

/** Skill 9 refinement — momentum fade: progressively smaller bodies into extreme */
function momentumFade(candles, bias, lookback = 5) {
  if (!candles || candles.length < lookback + 1) return false;
  const slice = candles.slice(-lookback - 1, -1);
  const sizes = slice.map(bodySize);
  let fading = true;
  for (let i = 1; i < sizes.length; i++) {
    if (sizes[i] > sizes[i - 1] * 1.15) fading = false;
  }
  const last = slice[slice.length - 1];
  const small = bodyRatio(last) < 0.35;
  return fading && small;
}

/**
 * Skill 8 — Dominance filter when price moves against bias.
 * Untested liquidity nearby in bias direction → pullback (stay with bias).
 * No nearby liquidity → real reversal risk (skip / flip).
 */
function skill8Filter(candles, bias) {
  if (!candles || candles.length < 10) return { ok: true, detail: "Insufficient bars — pass" };
  const bos = lastBOS(candles);
  const last = candles[candles.length - 1];
  if (!bos) return { ok: true, detail: "No opposing BOS — bias intact" };

  // Has structure against bias recently?
  const against =
    (bias === "bull" && bos.bias === "bear" && bos.index > candles.length - 12) ||
    (bias === "bear" && bos.bias === "bull" && bos.index > candles.length - 12);

  if (!against) return { ok: true, detail: "No recent opposing body-close BOS — dominance holds" };

  const sw = swings(candles, 2, 2);
  const a = atr(candles);
  // Untested liquidity = swing in bias direction not yet tagged by wick
  let untested = null;
  if (bias === "bull") {
    const lows = sw.filter((s) => s.kind === "low").slice(-6);
    for (const s of lows.reverse()) {
      let tagged = false;
      for (let i = s.index + 1; i < candles.length; i++) {
        if (candles[i].low <= s.price) tagged = true;
      }
      if (!tagged && Math.abs(last.close - s.price) < a * 3) {
        untested = s;
        break;
      }
    }
  } else {
    const highs = sw.filter((s) => s.kind === "high").slice(-6);
    for (const s of highs.reverse()) {
      let tagged = false;
      for (let i = s.index + 1; i < candles.length; i++) {
        if (candles[i].high >= s.price) tagged = true;
      }
      if (!tagged && Math.abs(last.close - s.price) < a * 3) {
        untested = s;
        break;
      }
    }
  }

  if (untested) {
    return {
      ok: true,
      detail: `Opposing pressure but untested liquidity @ ${untested.price} — pullback (Skill 8 Rule 3), stay with ${bias}`,
    };
  }
  return {
    ok: false,
    detail: "Opposing body-close BOS and no nearby untested liquidity — real reversal risk (Skill 8 Rule 4)",
  };
}

/**
 * Skill 10 — Standard liquidity sweep template
 * 1st sweep = bait (weak bounce). 2nd shallower = opposing side exhausted. Still need body confirm.
 */
function detectSweeps(candles, bias, zoneLevel) {
  if (!candles || candles.length < 8) return { sweep1: null, sweep2: null };
  const look = candles.slice(-50);
  const events = [];
  for (let i = 2; i < look.length; i++) {
    const c = look[i];
    if (bias === "bear") {
      // Buy-side liquidity grab: wick above zone, body closes back below
      if (c.high > zoneLevel && c.close < zoneLevel) {
        events.push({ index: i, extreme: c.high, epoch: c.epoch, kind: "high_sweep" });
      }
    } else {
      // Sell-side liquidity grab: wick below zone, body closes back above
      if (c.low < zoneLevel && c.close > zoneLevel) {
        events.push({ index: i, extreme: c.low, epoch: c.epoch, kind: "low_sweep" });
      }
    }
  }
  if (!events.length) return { sweep1: null, sweep2: null };
  const sweep1 = events[0];
  let sweep2 = null;
  for (let k = 1; k < events.length; k++) {
    const e = events[k];
    if (bias === "bear") {
      // 2nd shallower high = lower than 1st high
      if (e.extreme < sweep1.extreme) {
        sweep2 = {
          ...e,
          shallower: (sweep1.extreme - e.extreme) / Math.max(1e-9, Math.abs(sweep1.extreme)),
        };
        break;
      }
    } else {
      // 2nd shallower low = higher than 1st low (less deep)
      if (e.extreme > sweep1.extreme) {
        sweep2 = {
          ...e,
          shallower: (e.extreme - sweep1.extreme) / Math.max(1e-9, Math.abs(sweep1.extreme)),
        };
        break;
      }
    }
  }
  return { sweep1, sweep2 };
}

/**
 * Skill 9 + 10 confirmation — C1 wick through level body back, C2 body takeover
 */
function bodyCloseSequence(candles, bias, level) {
  if (!candles || candles.length < 3) return null;
  for (let i = candles.length - 2; i >= Math.max(1, candles.length - 12); i--) {
    const c1 = candles[i];
    const c2 = candles[i + 1];
    if (bias === "bear") {
      // Seller path: wick above level, body closes back, then C2 body below C1 body
      const c1Fail =
        c1.high > level &&
        c1.close < level &&
        upperWick(c1) >= bodySize(c1) * 0.4;
      const c2Win = sellerTakeover(c1, c2, level) || (c2.close < bodyBot(c1) && isBear(c2));
      const overrun = instantOverrun(c1, c2, "bear");
      if (c1Fail && (c2Win || overrun)) {
        return {
          c1,
          c2,
          mode: overrun ? "instant_overrun" : "seller_takeover",
          story:
            "Buyers pushed above level (wick) and failed — body closed back. " +
            (overrun
              ? "Next candle erased the bounce (instant overrun) — sellers in control."
              : "Next candle body closed below C1 — sellers confirmed takeover."),
        };
      }
    } else {
      const c1Fail =
        c1.low < level &&
        c1.close > level &&
        lowerWick(c1) >= bodySize(c1) * 0.4;
      const c2Win = buyerTakeover(c1, c2, level) || (c2.close > bodyTop(c1) && isBull(c2));
      const overrun = instantOverrun(c1, c2, "bull");
      if (c1Fail && (c2Win || overrun)) {
        return {
          c1,
          c2,
          mode: overrun ? "instant_overrun" : "buyer_takeover",
          story:
            "Sellers pushed below level (wick) and failed — body closed back. " +
            (overrun
              ? "Next candle erased the drop (instant overrun) — buyers in control."
              : "Next candle body closed above C1 — buyers confirmed takeover."),
        };
      }
    }
  }
  return null;
}

function nextLiquidity(candles, bias, fromPrice) {
  const sw = swings(candles || [], 2, 2);
  if (bias === "bull") {
    const highs = sw.filter((s) => s.kind === "high" && s.price > fromPrice);
    if (!highs.length) return null;
    return highs[highs.length - 1].price;
  }
  const lows = sw.filter((s) => s.kind === "low" && s.price < fromPrice);
  if (!lows.length) return null;
  return lows[lows.length - 1].price;
}

function pickChain(symbolInfo, mode) {
  const gold = symbolInfo.chain === "gold";
  if (mode === "scalp") return gold ? GOLD_SCALP : FOREX_SCALP;
  return gold ? GOLD_CHAIN : FOREX_CHAIN;
}

/**
 * Full scan — coordinates Skills 1,2,3,4,8,9,10
 * @param mode "standard" | "scalp"
 */
function scanSymbol(symbolInfo, frames, mode = "standard") {
  const log = [];
  const push = (stage, status, tf, msg) => log.push({ stage, status, tf, msg });
  const gold = symbolInfo.chain === "gold";
  const digits = symbolInfo.digits;
  const fmt = (n) => Number(n).toFixed(Math.min(5, digits));
  const jobs = pickChain(symbolInfo, mode);
  const modeLabel = mode === "scalp" ? "SCALP" : "STANDARD";

  const h4 = frames.h4 || [];
  const h1 = frames.h1 || [];
  const m15 = frames.m15 || [];
  const m5 = frames.m5 || [];
  const m3 = frames.m3 || [];
  const m1 = frames.m1 || [];

  push("mode", "ok", "—", `${modeLabel} mode · chain ${jobs.biasTf}→${jobs.realObTf}→${jobs.bodyConfirmTf}→${jobs.entryTf}`);

  // Skill 1 — bias from body-close BOS on bias TF
  const biasBars = jobs.biasTf === "h1" ? h1 : h4;
  const bos = lastBOS(biasBars);
  if (!bos) {
    push("dominance", "wait", jobs.biasTf, "No body-close BOS yet — cannot state buyer/seller control on bias TF.");
    return { setup: null, log, bias: null };
  }
  const bias = bos.bias;
  push(
    "dominance",
    "ok",
    jobs.biasTf,
    `${bos.reason}. Bias locked: ${bias === "bull" ? "BUYERS in control — buys only" : "SELLERS in control — sells only"}.`
  );

  // Skill 8 on 1H
  const s8 = skill8Filter(h1.length ? h1 : biasBars, bias);
  push("skill8", s8.ok ? "ok" : "fail", "1H", s8.detail);
  if (!s8.ok) return { setup: null, log, bias };

  // Momentum fade confluence (Skill 9 refinement) — optional note
  const fadeBars = gold ? m5 : m15;
  if (momentumFade(fadeBars, bias)) {
    push("body", "ok", gold ? "5m" : "15m", "Momentum-fade into extreme — opposing side losing energy (Skill 9).");
  }

  // Macro OB on 1H
  const h1Bos = lastBOS(h1.length ? h1 : biasBars);
  const macroOB = h1Bos ? findOB(h1.length ? h1 : biasBars, bias, h1Bos.index) : null;
  if (macroOB) {
    const st = zoneState(h1.length ? h1 : biasBars, macroOB, h1Bos.index);
    push("h1", "ok", "1H", `Macro OB ${fmt(macroOB.bot)}–${fmt(macroOB.top)} (${st}). ${macroOB.note}`);
  } else {
    push("h1", "wait", "1H", "Macro OB not clear yet.");
  }

  // Real OB on chain frame
  const realBars = jobs.realObTf === "m3" ? m3 : jobs.realObTf === "m5" ? m5 : m15;
  const realBos = lastBOS(realBars);
  if (!realBos || realBos.bias !== bias) {
    push("ob", "wait", jobs.realObTf, "Waiting for real OB impulse aligned with bias (body-close BOS).");
    return { setup: null, log, bias };
  }
  const realOb = findOB(realBars, bias, realBos.index);
  if (!realOb) {
    push("ob", "wait", jobs.realObTf, "Could not mark last opposing candle (OB).");
    return { setup: null, log, bias };
  }
  const obState = zoneState(realBars, realOb, realBos.index);
  push("ob", "ok", jobs.realObTf, `Real OB ${fmt(realOb.bot)}–${fmt(realOb.top)} [${obState}]. ${realOb.note}`);

  // Price must be interacting with zone (not random mid-air)
  const lastReal = realBars[realBars.length - 1];
  const pad = atr(realBars) * 0.35;
  const nearZone =
    lastReal &&
    lastReal.low <= realOb.top + pad &&
    lastReal.high >= realOb.bot - pad;
  if (!nearZone) {
    push("ob", "wait", jobs.realObTf, "Price not at real OB zone yet — waiting for buyers/sellers to return to the fight zone.");
    return { setup: null, log, bias };
  }

  // Skill 10 sweeps
  const sweepLevel = bias === "bear" ? realOb.top : realOb.bot;
  const sweepBars = jobs.sweepSpotTf === "m3" ? m3 : jobs.sweepSpotTf === "m5" ? m5 : m15;
  const { sweep1, sweep2 } = detectSweeps(sweepBars, bias, sweepLevel);
  if (!sweep1) {
    push(
      "sweep1",
      "wait",
      jobs.sweepSpotTf,
      bias === "bear"
        ? "Waiting for 1st buy-side liquidity grab (wick above zone, body back) — BAIT only."
        : "Waiting for 1st sell-side liquidity grab (wick below zone, body back) — BAIT only."
    );
    return { setup: null, log, bias };
  }
  push(
    "sweep1",
    "ok",
    jobs.sweepSpotTf,
    `1st liquidation @ ${fmt(sweep1.extreme)} — opposing side hunted stops. BAIT — do not enter.`
  );
  if (!sweep2) {
    push("sweep2", "wait", jobs.bodyConfirmTf, "Need 2nd SHALLLOWER sweep — proves opposing side is exhausted.");
    return { setup: null, log, bias };
  }
  push(
    "sweep2",
    "ok",
    jobs.bodyConfirmTf,
    `2nd shallower @ ${fmt(sweep2.extreme)} — opposing side weaker. Zone ready; still need body confirmation.`
  );

  // Skill 9 body-close C1/C2
  const bodyBars =
    jobs.bodyConfirmTf === "m1" ? m1 : jobs.bodyConfirmTf === "m3" ? m3 : m5;
  const bodyRes = bodyCloseSequence(bodyBars.length ? bodyBars : m1, bias, sweepLevel);
  if (!bodyRes) {
    push(
      "body",
      "wait",
      jobs.bodyConfirmTf,
      "Waiting for C1 (wick attempt fails, body back) + C2 (body takeover). Wick alone is not entry."
    );
    return { setup: null, log, bias };
  }
  push("body1", "ok", jobs.bodyConfirmTf, `C1: ${bodyRes.story.split(".")[0]}.`);
  push("body2", "ok", jobs.entryTf, `C2: ${bodyRes.mode} — ${bodyRes.story.split(". ").slice(1).join(". ")}`);

  const c2 = bodyRes.c2;
  const entry = c2.close;
  const pip = Math.pow(10, -Math.min(5, digits));
  const buffer = Math.max(atr(m1.length ? m1 : bodyBars) * 0.08, pip * 2);
  // SL beyond 2nd liquidation wick (Skill 10)
  const sl = bias === "bear" ? sweep2.extreme + buffer : sweep2.extreme - buffer;
  const risk = Math.abs(entry - sl);
  if (risk <= 0) {
    push("rr", "fail", jobs.entryTf, "Invalid risk distance.");
    return { setup: null, log, bias };
  }

  let tp = nextLiquidity(sweepBars, bias, entry);
  if (tp == null) tp = nextLiquidity(h1, bias, entry);
  const naturalRR = tp != null ? Math.abs(entry - tp) / risk : 0;
  if (tp == null || naturalRR < MIN_RR) {
    push(
      "rr",
      "fail",
      jobs.entryTf,
      tp == null
        ? "No opposing liquidity pool for TP — skip (do not invent targets)."
        : `Only ${naturalRR.toFixed(1)}R to next pool — need ≥${MIN_RR}R (Skill 6).`
    );
    return { setup: null, log, bias };
  }
  push("rr", "ok", jobs.entryTf, `TP ${fmt(tp)} at next pool = ${naturalRR.toFixed(1)}R (≥${MIN_RR}R).`);

  const score = Math.min(
    99,
    Math.round(
      50 +
        (obState === "live" ? 10 : 4) +
        Math.min(12, (sweep2.shallower || 0) * 40) +
        Math.min(10, bodyRatio(c2) * 14) +
        (bodyRes.mode === "instant_overrun" ? 6 : 3) +
        Math.min(10, (naturalRR - MIN_RR) * 3) +
        (mode === "scalp" ? 0 : 2)
    )
  );

  return {
    setup: {
      symbol: symbolInfo.symbol,
      symbolName: symbolInfo.name,
      mt5: symbolInfo.mt5,
      bias,
      side: bias === "bear" ? "sell" : "buy",
      entry,
      sl,
      tp,
      risk,
      rr: naturalRR,
      c2Epoch: c2.epoch,
      score,
      mode: modeLabel,
      confirmMode: bodyRes.mode,
      story: bodyRes.story,
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
  GOLD_CHAIN,
  FOREX_CHAIN,
  GOLD_SCALP,
  FOREX_SCALP,
};
