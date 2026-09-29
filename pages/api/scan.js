const { DerivClient } = require("../../lib/deriv");
const { WATCHLIST, MIN_STAKE, scanSymbol } = require("../../lib/strategy");
const {
  logEvent,
  saveScanResult,
  getOpenTrade,
  saveTrade,
  getSeenKeys,
} = require("../../lib/supabase");

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

  try {
    const open = await getOpenTrade();
    if (open) {
      await logEvent({ stage: "scan", status: "skip", message: "Trade already open." });
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "open_trade",
        openTrade: open,
        ms: Date.now() - started,
      });
    }

    const seen = await getSeenKeys();
    const deriv = new DerivClient();
    // PAT flow: resolve OTP session URL first, then connect (do not hit classic WS)
    await deriv.authorize();
    await logEvent({
      stage: "auth",
      status: "ok",
      message: `Authorized ${deriv.loginid} balance=${deriv.balance} ${deriv.currency}`,
    });

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
            });
            await logEvent({
              stage: "fill",
              status: "ok",
              symbol: info.symbol,
              message: `LIVE FILL ${bought.contractId}`,
            });
          } catch (err) {
            tradePlaced = await saveTrade({
              ...setup,
              stake: MIN_STAKE,
              status: "paper",
              note: `key:${key} | ${err.message}`,
            });
            await logEvent({
              stage: "fill",
              status: "fail",
              symbol: info.symbol,
              message: `Buy failed (paper): ${err.message}`,
            });
          }
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
    });
  } catch (err) {
    await logEvent({ stage: "fatal", status: "fail", message: err.message });
    return res.status(500).json({ ok: false, error: err.message, ms: Date.now() - started });
  }
}
