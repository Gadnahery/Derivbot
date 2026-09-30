const { DerivClient } = require("../../lib/deriv");
const { WATCHLIST, MIN_STAKE, scanSymbol } = require("../../lib/strategy");
const {
  logEvent,
  saveScanResult,
  getOpenTrade,
  saveTrade,
  updateTrade,
  computePnl,
  getSeenKeys,
  hasTradeKey,
  saveSignal,
  markSignalNotified,
  getClient,
} = require("../../lib/supabase");
const { sendPushToAll, buildSignalPayload } = require("../../lib/push");

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || "";
  if (cronSecret && process.env.VERCEL_ENV === "production") {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const started = Date.now();
  const results = [];
  let tradePlaced = null;
  let openManaged = null;

  try {
    const deriv = new DerivClient();
    await deriv.authorize();
    await logEvent({
      stage: "auth",
      status: "ok",
      message: `Authorized ${deriv.loginid} balance=${deriv.balance} ${deriv.currency}`,
    });

    // ── Manage open trade: mark price, unrealized PnL, settle SL/TP ──
    const open = await getOpenTrade();
    if (open) {
      try {
        const m1 = await deriv.fetchCandles(open.symbol, 60, 5);
        const price = m1.length ? m1[m1.length - 1].close : null;
        if (price != null) {
          const { unrealized, hit, settledPnl, rMultiple } = computePnl(open, price);
          if (hit) {
            const settled = await updateTrade(open.id, {
              status: hit,
              exit_price: price,
              current_price: price,
              pnl: settledPnl,
              unrealized_pnl: 0,
              settled_at: new Date().toISOString(),
            });
            openManaged = settled;
            await logEvent({
              stage: "settle",
              status: hit === "won" ? "ok" : "fail",
              symbol: open.symbol,
              message: `Trade ${hit.toUpperCase()} @ ${price} · PnL ${settledPnl >= 0 ? "+" : ""}${Number(settledPnl).toFixed(2)} USD (${rMultiple.toFixed(2)}R)`,
              payload: { price, settledPnl, hit },
            });
          } else {
            const updated = await updateTrade(open.id, {
              current_price: price,
              unrealized_pnl: unrealized,
            });
            openManaged = updated;
            await logEvent({
              stage: "mark",
              status: "ok",
              symbol: open.symbol,
              message: `Open ${open.side} mark ${price} · uPnL ${unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)} USD (${rMultiple.toFixed(2)}R)`,
            });
          }
        }
      } catch (e) {
        await logEvent({
          stage: "mark",
          status: "fail",
          symbol: open.symbol,
          message: `Mark failed: ${e.message}`,
        });
      }

      // Still one trade at a time — do not open new while one is open
      const stillOpen = await getOpenTrade();
      if (stillOpen) {
        deriv.close();
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: "open_trade",
          openTrade: openManaged || stillOpen,
          ms: Date.now() - started,
        });
      }
    }

    const seen = await getSeenKeys();

    for (const info of WATCHLIST) {
      try {
        await logEvent({
          stage: "scan",
          status: "start",
          symbol: info.symbol,
          message: `Scanning ${info.name}`,
        });
        const frames = await deriv.loadFrames(info.symbol);
        const { setup, log, bias } = scanSymbol(info, frames);

        for (const l of log) {
          await logEvent({
            stage: l.stage,
            status: l.status,
            symbol: info.symbol,
            message: `[${l.tf}] ${l.msg}`,
          });
        }

        await saveScanResult({ symbol: info.symbol, bias, setup, log });
        results.push({
          symbol: info.symbol,
          name: info.name,
          bias,
          hasSetup: !!setup,
          setup: setup || null,
        });

        if (setup) {
          const key = `${setup.symbol}:${setup.side}:${setup.c2Epoch}`;
          if (seen.has(key)) {
            await logEvent({
              stage: "setup",
              status: "skip",
              symbol: info.symbol,
              message: "Already acted on this C2.",
            });
            continue;
          }

          await logEvent({
            stage: "setup",
            status: "ok",
            symbol: info.symbol,
            message: `${setup.side.toUpperCase()} entry=${setup.entry} rr=${setup.rr.toFixed(2)}`,
            payload: setup,
          });

          // Build human criteria for MT5 signal (Skills 1–10 summary)
          const criteria = {
            system: "SMC/ICT Skills 1-10",
            pairs: "XAUUSD · EURUSD · GBPUSD · GBPJPY · BTCUSD",
            chain: info.chain === "gold" ? "4H→1H→5m OB→3m body→1m (XAU)" : "4H→1H→15m OB→5m body→1m (FX/BTC)",
            steps: (log || []).map((l) => ({
              stage: l.stage,
              status: l.status,
              tf: l.tf,
              msg: l.msg,
            })),
            rules: {
              bos: "4H body close BOS only (Skill 1)",
              dominance: "Skill 8 pullback vs reversal via untested liquidity",
              sweeps: "1st liquidation = bait; 2nd shallower = zone (Skill 10)",
              bodyClose: "C1 wick fail + C2 body takeover (Skill 9)",
              minRr: "TP at next pool, minimum 3R (Skill 6)",
            },
            mt5: {
              symbol: info.mt5 || info.name,
              side: setup.side,
              entry: setup.entry,
              sl: setup.sl,
              tp: setup.tp,
              lotHint: "0.01 micro per plan",
            },
          };

          const signalRow = await saveSignal({
            ...setup,
            symbolName: info.name,
            mt5: info.mt5 || info.name,
            bias: bias || setup.bias,
            criteria,
            status: "new",
            notified: false,
          });

          try {
            const sb = getClient();
            const payload = buildSignalPayload(setup, info, criteria);
            const pushResult = await sendPushToAll(sb, payload);
            if (signalRow?.id) await markSignalNotified(signalRow.id);
            await logEvent({
              stage: "signal",
              status: "ok",
              symbol: info.symbol,
              message: `Signal saved + push sent=${pushResult.sent} fail=${pushResult.failed} · MT5 ${info.mt5 || info.name} ${setup.side} ${Number(setup.rr).toFixed(1)}R`,
            });
          } catch (pushErr) {
            await logEvent({
              stage: "signal",
              status: "fail",
              symbol: info.symbol,
              message: `Signal saved but push failed: ${pushErr.message}`,
            });
          }

          // Hard guarantee: one trade per setup key
          const existing = await hasTradeKey(key);
          if (existing) {
            await logEvent({
              stage: "setup",
              status: "skip",
              symbol: info.symbol,
              message: `Already one trade for this setup (id ${existing.id}).`,
            });
            seen.add(key);
            continue;
          }

          try {
            const bought = await deriv.proposalAndBuy(
              setup.side,
              setup.symbol,
              MIN_STAKE,
              setup.rr
            );
            tradePlaced = await saveTrade({
              ...setup,
              stake: MIN_STAKE,
              status: "open",
              contractId: bought.contractId,
              note: `key:${key}`,
              execution: "live",
              current_price: setup.entry,
              unrealized_pnl: 0,
            });
            seen.add(key);
            await logEvent({
              stage: "fill",
              status: "ok",
              symbol: info.symbol,
              message: `LIVE FILL ${bought.contractId} stake=${MIN_STAKE} · ${setup.side} ${Number(setup.rr).toFixed(1)}R`,
            });
          } catch (err) {
            // Paper record only — does NOT stay "open" (won't block new different setups)
            tradePlaced = await saveTrade({
              ...setup,
              stake: MIN_STAKE,
              status: "paper",
              note: `key:${key} | paper: ${err.message}`,
              execution: "paper",
              current_price: setup.entry,
              unrealized_pnl: 0,
              pnl: null,
            });
            seen.add(key);
            await logEvent({
              stage: "fill",
              status: "fail",
              symbol: info.symbol,
              message: `Buy failed — recorded paper only (no open position): ${err.message}`,
            });
          }
          // Only one new trade attempt per scan cycle
          break;
        }
      } catch (symErr) {
        await logEvent({
          stage: "scan",
          status: "fail",
          symbol: info.symbol,
          message: symErr.message,
        });
        results.push({ symbol: info.symbol, error: symErr.message });
      }
    }

    deriv.close();
    return res.status(200).json({
      ok: true,
      ms: Date.now() - started,
      results,
      tradePlaced,
      openManaged,
    });
  } catch (err) {
    await logEvent({ stage: "fatal", status: "fail", message: err.message });
    return res.status(500).json({ ok: false, error: err.message, ms: Date.now() - started });
  }
}
