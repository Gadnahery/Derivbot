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

/** Synthetic Volatility indices — Rise/Fall options (no FX) */
const WATCHLIST = [
  // Single pair focus — quality over quantity (need WR > ~54% to profit at 0.85 payout)
  { symbol: "R_100", name: "Vol 100", chain: "synth", digits: 2, duration: 1, durationUnit: "m", stake: 0.35 },
];


/** Stake for Rise/Fall (Deriv min often 0.35) */
const RF_STAKE = 0.35;


const MIN_RR = 3.0;
const MIN_STAKE = 0.35;
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


/**
 * Skill 12 — 1min micro-consolidation after sharp sweep.
 * Find tight 2–3 candle cluster near the sweep extreme; use cluster edge for tighter SL
 * instead of the full sweep wick (validated in plan: ~10 pips vs 60+).
 */
function microClusterSL(m1, bias, sweepExtreme, entry) {
  if (!m1 || m1.length < 6) return null;
  const look = m1.slice(-20);
  // candles near the sweep extreme
  const near = look.filter((c) => {
    if (bias === "bear") return Math.abs(c.high - sweepExtreme) / Math.max(1e-9, Math.abs(sweepExtreme)) < 0.0025
      || c.high >= sweepExtreme * 0.999;
    return Math.abs(c.low - sweepExtreme) / Math.max(1e-9, Math.abs(sweepExtreme)) < 0.0025
      || c.low <= sweepExtreme * 1.001;
  });
  const cluster = near.length >= 2 ? near.slice(-3) : look.slice(-3);
  if (bias === "bear") {
    const hi = Math.max(...cluster.map((c) => c.high));
    if (hi < entry) return hi; // SL above cluster
  } else {
    const lo = Math.min(...cluster.map((c) => c.low));
    if (lo > 0 && lo < entry) return lo;
  }
  return null;
}

/** Instrument SL bands from Skill 6 / 4A / 4B (price units) */
function slBands(symbolInfo) {
  const s = symbolInfo.symbol || "";
  if (s.includes("XAU")) return { min: 8, max: 18, label: "pts" }; // gold ~12–15 preferred
  if (s.includes("JPY")) return { min: 0.08, max: 0.35, label: "pips*" }; // ~8–35 pip-ish on JPY
  if (s.includes("BTC")) return { min: 80, max: 400, label: "USD" };
  // major FX 5-digit: 0.0010 = 10 pips
  return { min: 0.0008, max: 0.0028, label: "pips*" };
}

const MIN_SCORE = 50;
const MIN_C2_BODY = 0.28; // C2 must show real body — who won, not a doji

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
  // Scalp: wider pad so we can test body-close when price is approaching the fight zone
  const lastReal = realBars[realBars.length - 1];
  const padMult = mode === "scalp" ? 0.9 : 0.4;
  const pad = atr(realBars) * padMult;
  const nearZone =
    lastReal &&
    lastReal.low <= realOb.top + pad &&
    lastReal.high >= realOb.bot - pad;
  if (!nearZone) {
    push("ob", "wait", jobs.realObTf, "Price not at real OB zone yet — waiting for buyers/sellers to return to the fight zone.");
    return { setup: null, log, bias };
  }

  // Skill 10 sweeps (+ Skill 5 first-liquidation path in scalp)
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
    `1st liquidation @ ${fmt(sweep1.extreme)} — opposing side hunted stops. BAIT — do not enter yet.`
  );

  // Standard: require 2nd shallower (Skill 10). Scalp: allow Skill 5 first-liquidation + strong body later.
  let activeSweep = sweep2;
  let entryPath = "second_liquidation";
  if (!sweep2) {
    if (mode === "scalp") {
      activeSweep = { extreme: sweep1.extreme, shallower: 0, index: sweep1.index };
      entryPath = "first_liquidation";
      push(
        "sweep2",
        "ok",
        jobs.bodyConfirmTf,
        "Scalp path: Skill 5 first-liquidation entry — 2nd sweep not required; body-close C1/C2 must still confirm."
      );
    } else {
      push("sweep2", "wait", jobs.bodyConfirmTf, "Need 2nd SHALLLOWER sweep — proves opposing side is exhausted.");
      return { setup: null, log, bias };
    }
  } else {
    push(
      "sweep2",
      "ok",
      jobs.bodyConfirmTf,
      `2nd shallower @ ${fmt(sweep2.extreme)} — opposing side weaker. Zone ready; still need body confirmation.`
    );
  }

  // Skill 9 body-close C1/C2
  const bodyBars =
    jobs.bodyConfirmTf === "m1" ? m1 : jobs.bodyConfirmTf === "m3" ? m3 : m5;
  const bodyRes = bodyCloseSequence(bodyBars.length ? bodyBars : m1, bias, activeSweep.extreme || sweepLevel);
  if (!bodyRes) {
    push(
      "body",
      "wait",
      jobs.bodyConfirmTf,
      "Waiting for C1 (wick attempt fails, body back) + C2 (body takeover). Wick alone is not entry."
    );
    return { setup: null, log, bias };
  }

  const c1 = bodyRes.c1;
  const c2 = bodyRes.c2;

  // Freshness: C2 must be among the last 3 closed bars on the body TF
  const bodyIdx = (bodyBars.length ? bodyBars : m1).indexOf(c2);
  const bodyLen = (bodyBars.length ? bodyBars : m1).length;
  if (bodyIdx >= 0 && bodyIdx < bodyLen - 3) {
    push("body", "wait", jobs.bodyConfirmTf, "Body-close sequence is stale — need a fresh C1/C2 near the right edge.");
    return { setup: null, log, bias };
  }

  // C2 must show a real winner (body), not indecision
  const c2Ratio = bodyRatio(c2);
  if (c2Ratio < MIN_C2_BODY) {
    push("body", "wait", jobs.bodyConfirmTf, `C2 body too small (${(c2Ratio * 100).toFixed(0)}%) — neither side clearly won. Wait.`);
    return { setup: null, log, bias };
  }

  // C2 direction must match bias (buyers/sellers actually closed in our favor)
  if (bias === "bull" && !isBull(c2)) {
    push("body", "fail", jobs.bodyConfirmTf, "C2 is not a bullish body — buyers did not win the close.");
    return { setup: null, log, bias };
  }
  if (bias === "bear" && !isBear(c2)) {
    push("body", "fail", jobs.bodyConfirmTf, "C2 is not a bearish body — sellers did not win the close.");
    return { setup: null, log, bias };
  }

  // Skill 3: consumed OB is weaker — demand stronger confirm
  if (obState === "consumed" && bodyRes.mode !== "instant_overrun" && c2Ratio < 0.45) {
    push(
      "ob",
      "wait",
      jobs.realObTf,
      "OB is consumed (already tagged) — need stronger body takeover or instant overrun before entry."
    );
    return { setup: null, log, bias };
  }

  push("body1", "ok", jobs.bodyConfirmTf, `C1: ${bodyRes.story.split(".")[0]}.`);
  push("body2", "ok", jobs.entryTf, `C2: ${bodyRes.mode} · body ${(c2Ratio * 100).toFixed(0)}% — ${bodyRes.story.split(". ").slice(1).join(". ")}`);

  const entry = c2.close;
  const pip = Math.pow(10, -Math.min(5, digits));
  const buffer = Math.max(atr(m1.length ? m1 : bodyBars) * 0.06, pip * 2);

  // Default SL beyond 2nd liquidation (Skill 10)
  let sl = bias === "bear" ? activeSweep.extreme + buffer : activeSweep.extreme - buffer;
  let slSource = "2nd sweep wick";

  // Skill 12 — try tighten with 1m micro-cluster
  const micro = microClusterSL(m1, bias, activeSweep.extreme, entry);
  if (micro != null) {
    const tight = bias === "bear" ? micro + buffer : micro - buffer;
    const wideRisk = Math.abs(entry - sl);
    const tightRisk = Math.abs(entry - tight);
    if (tightRisk > 0 && tightRisk < wideRisk * 0.85) {
      sl = tight;
      slSource = "1m micro-cluster (Skill 12)";
      push("sl", "ok", "1m", `SL tightened via 1m absorption cluster @ ${fmt(micro)} instead of full sweep wick.`);
    }
  }

  let risk = Math.abs(entry - sl);
  if (risk <= 0) {
    push("rr", "fail", jobs.entryTf, "Invalid risk distance.");
    return { setup: null, log, bias };
  }

  // Skill 6 / 4A / 4B — SL band filters
  const bands = slBands(symbolInfo);
  if (risk < bands.min) {
    push("rr", "fail", jobs.entryTf, `SL too tight (${fmt(risk)} < min ${fmt(bands.min)} ${bands.label}) — noise risk.`);
    return { setup: null, log, bias };
  }
  if (risk > bands.max) {
    push("rr", "fail", jobs.entryTf, `SL too wide (${fmt(risk)} > max ${fmt(bands.max)} ${bands.label}) — skip per plan sizing.`);
    return { setup: null, log, bias };
  }
  push("sl", "ok", jobs.entryTf, `SL ${fmt(sl)} via ${slSource} · risk ${fmt(risk)}.`);

  let tp = nextLiquidity(sweepBars, bias, entry);
  if (tp == null) tp = nextLiquidity(h1, bias, entry);
  // Ensure TP is on the correct side of entry
  if (tp != null) {
    if (bias === "bull" && tp <= entry) tp = null;
    if (bias === "bear" && tp >= entry) tp = null;
  }
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
      48 +
        (obState === "live" ? 12 : 3) +
        Math.min(14, (activeSweep.shallower || 0) * 50) +
        (entryPath === "second_liquidation" ? 4 : 0) +
        Math.min(12, c2Ratio * 16) +
        (bodyRes.mode === "instant_overrun" ? 8 : 4) +
        Math.min(12, (naturalRR - MIN_RR) * 3.5) +
        (slSource.includes("Skill 12") ? 4 : 0) +
        (mode === "scalp" ? 0 : 2)
    )
  );

  if (score < MIN_SCORE) {
    push("score", "fail", jobs.entryTf, `Score ${score} < ${MIN_SCORE} — setup present but not selective enough. Skip.`);
    return { setup: null, log, bias };
  }
  push("score", "ok", jobs.entryTf, `Score ${score}/99 — selective enough to signal.`);

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
      slSource,
      obState,
    },
    log,
    bias,
  };
}


/**
 * Rise/Fall scan for synthetic indices.
 * Uses Skill 9 body dominance on M1 + short structure:
 * - Recent body-close direction (buyers vs sellers)
 * - Momentum fade / takeover on last 3–5 candles
 * - Optional micro sweep on M1
 * Returns rise (CALL) or fall (PUT) with duration from pair config.
 */
function scanRiseFall(symbolInfo, frames) {
  const log = [];
  const push = (stage, status, tf, msg) => log.push({ stage, status, tf, msg });
  const m1 = frames.m1 || [];
  const m5 = frames.m5 || [];

  if (m1.length < 30 || m5.length < 20) {
    push("data", "wait", "1m", "Need more history.");
    return { setup: null, log, bias: null };
  }

  const c0 = m1[m1.length - 1];
  const c1 = m1[m1.length - 2];
  const c2 = m1[m1.length - 3];
  const c3 = m1[m1.length - 4];
  const c4 = m1[m1.length - 5];

  // M5 bias only — skip weak majority fallback (was creating false bias)
  const bos = lastBOS(m5);
  if (!bos) {
    push("dominance", "wait", "5m", "No body-close BOS on 5m — no trade.");
    return { setup: null, log, bias: null };
  }
  const bias = bos.bias;
  push("dominance", "ok", "5m", bias === "bull" ? "5m buyers — CALL setups only." : "5m sellers — PUT setups only.");

  // Recent M1 must not be chopping: last 6 candles direction score
  const last6 = m1.slice(-6);
  let align = 0;
  for (const c of last6) {
    if (bias === "bull" && isBull(c)) align++;
    if (bias === "bear" && isBear(c)) align++;
  }
  if (align < 3) {
    push("dominance", "wait", "1m", `Only ${align}/6 bodies with bias — chop, skip.`);
    return { setup: null, log, bias };
  }

  // ANTI-CHASE: require pullback then takeover (Skill 9)
  const br0 = bodyRatio(c0);
  const br1 = bodyRatio(c1);
  if (br0 < 0.32) {
    push("body", "wait", "1m", `Confirm body ${(br0 * 100).toFixed(0)}% < 32%.`);
    return { setup: null, log, bias };
  }
  if (br0 > 0.75) {
    push("body", "wait", "1m", "Exhaustion body — too late for 1m RF.");
    return { setup: null, log, bias };
  }

  // 3-in-a-row same color = chase
  if (bias === "bull" && isBull(c0) && isBull(c1) && isBull(c2)) {
    push("body", "wait", "1m", "Chase filter: already 3 bullish — skip.");
    return { setup: null, log, bias };
  }
  if (bias === "bear" && isBear(c0) && isBear(c1) && isBear(c2)) {
    push("body", "wait", "1m", "Chase filter: already 3 bearish — skip.");
    return { setup: null, log, bias };
  }

  let confirm = null;
  if (bias === "bull") {
    // Must have pullback: c1 or c2 bearish OR lower wick, then c0 bullish close above c1 body
    const hadPull = isBear(c1) || isBear(c2) || lowerWick(c1) > bodySize(c1);
    if (!hadPull) {
      push("body", "wait", "1m", "No pullback before CALL.");
      return { setup: null, log, bias };
    }
    if (!isBull(c0) || c0.close <= bodyTop(c1)) {
      push("body", "wait", "1m", "Need bullish takeover close above prior body.");
      return { setup: null, log, bias };
    }
    // Prefer: pullback candle had real body (not doji)
    if (br1 < 0.15 && bodyRatio(c2) < 0.15) {
      push("body", "wait", "1m", "Pullback too weak (dojis).");
      return { setup: null, log, bias };
    }
    confirm = "buyer_takeover_after_pullback";
  } else {
    const hadPull = isBull(c1) || isBull(c2) || upperWick(c1) > bodySize(c1);
    if (!hadPull) {
      push("body", "wait", "1m", "No pullback before PUT.");
      return { setup: null, log, bias };
    }
    if (!isBear(c0) || c0.close >= bodyBot(c1)) {
      push("body", "wait", "1m", "Need bearish takeover close below prior body.");
      return { setup: null, log, bias };
    }
    if (br1 < 0.15 && bodyRatio(c2) < 0.15) {
      push("body", "wait", "1m", "Pullback too weak (dojis).");
      return { setup: null, log, bias };
    }
    confirm = "seller_takeover_after_pullback";
  }
  push("body2", "ok", "1m", confirm);

  // Micro structure: entry candle close should be in direction of bias vs open of c2
  if (bias === "bull" && c0.close < c3.close) {
    push("body", "wait", "1m", "No higher structure — CALL weak.");
    return { setup: null, log, bias };
  }
  if (bias === "bear" && c0.close > c3.close) {
    push("body", "wait", "1m", "No lower structure — PUT weak.");
    return { setup: null, log, bias };
  }

  const side = bias === "bull" ? "rise" : "fall";
  const entry = c0.close;
  const duration = 1;
  const durationUnit = "m";
  const stake = 0.35;

  let score = 55;
  score += 20; // bos required
  score += Math.min(15, br0 * 18);
  score += align >= 4 ? 10 : 5;
  score += confirm.includes("takeover") ? 10 : 0;
  score = Math.min(99, Math.round(score));

  const minScore = Math.max(MIN_SCORE || 50, 72);
  if (score < minScore) {
    push("score", "fail", "1m", `Score ${score} < ${minScore} — quality gate.`);
    return { setup: null, log, bias };
  }
  push("score", "ok", "1m", `Score ${score} · ${side.toUpperCase()} 1m`);

  return {
    setup: {
      symbol: symbolInfo.symbol,
      symbolName: symbolInfo.name,
      mt5: symbolInfo.name,
      bias,
      side,
      entry,
      sl: null,
      tp: null,
      risk: stake,
      rr: 0.85,
      c2Epoch: c0.epoch,
      score,
      mode: "RISEFALL",
      confirmMode: confirm,
      story: `${side.toUpperCase()} · ${confirm} · 1m`,
      duration,
      durationUnit,
      stake,
      contract: side === "rise" ? "CALL" : "PUT",
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
  MIN_SCORE,
  scanSymbol,
  scanRiseFall,
  RF_STAKE,
  GOLD_CHAIN,
  FOREX_CHAIN,
  GOLD_SCALP,
  FOREX_SCALP,
};
