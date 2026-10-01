const { DerivClient } = require("../../lib/deriv");
const { WATCHLIST, MIN_STAKE, MIN_SCORE, scanRiseFall, RF_STAKE } = require("../../lib/strategy");
const {
  logEvent,
  saveScanResult,
  getOpenTrades,
  saveTrade,
  updateTrade,
  computePnl,
  getSeenKeys,
  hasTradeKey,
  saveSignal,
  markSignalNotified,
  getClient,
  getSetting,
  setSetting,
} = require("../../lib/supabase");
const { sendPushToAll, buildSignalPayload } = require("../../lib/push");

export const config = {
  maxDuration: 60,
};

const TF_GRAN = {
  m1: 60,
  m5: 300,
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rise/Fall synthetics only
  const MAX_OPEN = 1;
  const modes = ["risefall"];
  const started = Date.now();
  const results = [];
  let tradePlaced = null;
  let openManaged = null;


    async function snapAccount(deriv, accountMode) {
      try {
        await deriv.refreshBalance();
      } catch {}
      await setSetting("accountSnap", {
        loginid: deriv.loginid,
        balance: deriv.balance,
        currency: deriv.currency,
        isDemo: !!deriv.isDemo,
        mode: accountMode,
        at: new Date().toISOString(),
      });
    }

  try {
    const qMode = String(req.query.account || (req.body && req.body.account) || "").toLowerCase();
    const stored = await getSetting("accountMode", "demo");
    const accountMode = qMode === "live" || qMode === "demo" ? qMode : (stored === "live" ? "live" : "demo");

    const deriv = new DerivClient({ accountMode });
    await deriv.authorize();

    await logEvent({
      stage: "mode",
      status: "ok",
      message: `Rise/Fall scalp · account=${accountMode} (${deriv.isDemo ? "DEMO" : "LIVE"}) · maxOpen=${MAX_OPEN} · stake=0.35`,
    });

    await logEvent({
      stage: "auth",
      status: "ok",
      message: `Authorized ${deriv.loginid} balance=${deriv.balance} ${deriv.currency} · ${deriv.isDemo ? "DEMO" : "LIVE"}`,
    });
    await snapAccount(deriv, accountMode);

    // Manage ALL open trades
    const opens = await getOpenTrades();
    const managed = [];
    for (const open of opens) {
      try {
        const m1 = await deriv.fetchCandles(open.symbol, 60, 5);
        const price = m1.length ? m1[m1.length - 1].close : null;

        // Prefer REAL Deriv contract result (fixes false losses from late price marks)
        let hit = null;
        let settledPnl = null;
        let exitPrice = price;
        let source = "price";

        const cid = open.contract_id;
        const expiresAt = open.expires_at ? new Date(open.expires_at).getTime() : 0;
        const openedAt = open.at ? new Date(open.at).getTime() : 0;
        const pastExpiry = expiresAt ? Date.now() >= expiresAt : Date.now() - openedAt > 70000;

        if (cid && pastExpiry) {
          const cr = await deriv.getContractResult(cid);
          if (cr && cr.hit) {
            hit = cr.hit;
            settledPnl = cr.profit != null ? Number(cr.profit) : hit === "won" ? Number(open.stake || 0.35) * 0.85 : -Number(open.stake || 0.35);
            if (cr.exitPrice != null) exitPrice = cr.exitPrice;
            source = "deriv_contract";
          }
        }

        if (!hit && price != null && pastExpiry) {
          const r = computePnl(open, price);
          if (r.hit && r.ready !== false) {
            hit = r.hit;
            settledPnl = r.settledPnl;
            source = "price_fallback";
          }
        }

        if (hit) {
          const settled = await updateTrade(open.id, {
            status: hit,
            exit_price: exitPrice,
            current_price: exitPrice,
            pnl: settledPnl,
            unrealized_pnl: 0,
            settled_at: new Date().toISOString(),
          });
          managed.push(settled);
          await logEvent({
            stage: "settle",
            status: hit === "won" ? "ok" : "fail",
            symbol: open.symbol,
            message: `RF ${hit.toUpperCase()} ${open.side} via ${source} · exit ${exitPrice} entry ${open.entry} · PnL ${settledPnl >= 0 ? "+" : ""}${Number(settledPnl).toFixed(2)}`,
          });
        } else if (price != null) {
          const r = computePnl(open, price);
          const updated = await updateTrade(open.id, {
            current_price: price,
            unrealized_pnl: r.unrealized,
          });
          managed.push(updated);
          await logEvent({
            stage: "mark",
            status: "ok",
            symbol: open.symbol,
            message: `Open ${open.side} mark ${price} vs entry ${open.entry} · waiting expiry/contract`,
          });
        }
      } catch (e) {
        await logEvent({
          stage: "mark",
          status: "fail",
          symbol: open.symbol,
          message: `Mark failed: ${e.message}`,
        });
      }
    }
    openManaged = managed[0] || null;

    let openCount = (await getOpenTrades()).length;
    if (openCount >= MAX_OPEN) {
      await logEvent({
        stage: "risk",
        status: "wait",
        message: `${openCount} open trades — max ${MAX_OPEN}. Managing only.`,
      });
      deriv.close();
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "max_open",
        openCount,
        openTrades: managed,
        ms: Date.now() - started,
      });
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

        const frames = {};
        for (const [tf, gran] of Object.entries(TF_GRAN)) {
          frames[tf] = await deriv.fetchCandles(
            info.symbol,
            gran,
            tf === "m1" ? 80 : 60
          );
        }

        for (const mode of modes) {
          openCount = (await getOpenTrades()).length;
          if (openCount >= MAX_OPEN) break;

          const { setup, log, bias } = scanRiseFall(info, frames);

          for (const line of log || []) {
            await logEvent({
              stage: line.stage,
              status: line.status,
              symbol: info.symbol,
              message: `[${line.tf || ""}] ${line.msg}`,
            });
          }

          const validSetup =
            setup && (setup.score == null || setup.score >= (MIN_SCORE || 50));

          await saveScanResult({
            symbol: info.symbol,
            bias,
            setup: validSetup ? setup : null,
            log,
          });

          if (!validSetup) continue;

          results.push({ symbol: info.symbol, setup, log, bias, mode });

          const key = `${setup.symbol}:${setup.side}:${setup.c2Epoch}:${mode}`;
          if (seen.has(key)) {
            await logEvent({
              stage: "setup",
              status: "skip",
              symbol: info.symbol,
              message: `Already used setup key ${key}`,
            });
            continue;
          }

          await logEvent({
            stage: "setup",
            status: "ok",
            symbol: info.symbol,
            message: `${mode.toUpperCase()} ${setup.side.toUpperCase()} entry=${setup.entry} rr=${Number(setup.rr).toFixed(2)} score=${setup.score}`,
            payload: setup,
          });

          const criteria = {
            system: "SMC/ICT Skills 1-10",
            mode,
            chain: "Synthetic Rise/Fall · 5m bias · 1m body (Skill 9)",
            steps: (log || []).map((l) => ({
              stage: l.stage,
              status: l.status,
              tf: l.tf,
              msg: l.msg,
            })),
            rules: {
              bos: "Body-close BOS only (Skill 1)",
              dominance: "Skill 8 pullback vs reversal",
              sweeps: "1st bait · 2nd shallower (Skill 10)",
              bodyClose: "C1 + C2 body takeover (Skill 9)",
              minRr: "Min 3R to next pool (Skill 6)",
            },
            mt5: {
              symbol: info.mt5 || info.name,
              side: setup.side,
              entry: setup.entry,
              sl: setup.sl,
              tp: setup.tp,
              lotHint: "0.01 micro",
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
            payload.title = `[${mode.toUpperCase()}] ${payload.title}`;
            const pushResult = await sendPushToAll(sb, payload);
            if (signalRow && signalRow.id) await markSignalNotified(signalRow.id);
            await logEvent({
              stage: "signal",
              status: "ok",
              symbol: info.symbol,
              message: `Signal ${mode} push=${pushResult.sent} · ${info.mt5} ${setup.side} ${Number(setup.rr).toFixed(1)}R`,
            });
          } catch (pushErr) {
            await logEvent({
              stage: "signal",
              status: "fail",
              symbol: info.symbol,
              message: `Push failed: ${pushErr.message}`,
            });
          }

          const existing = await hasTradeKey(key);
          if (existing) {
            seen.add(key);
            continue;
          }

          try {
            const bought = await deriv.buyRiseFall(
              setup.side,
              setup.symbol,
              setup.stake || RF_STAKE || MIN_STAKE || 1,
              setup.duration || 5,
              setup.durationUnit || "t"
            );
            const dur = setup.duration || 1;
            const unit = setup.durationUnit || "m";
            const durMs = unit === "t" ? dur * 2000 : unit === "s" ? dur * 1000 : dur * 60000;
            const expires_at = new Date(Date.now() + durMs + 3000).toISOString();
            tradePlaced = await saveTrade({
              ...setup,
              stake: setup.stake || MIN_STAKE || 0.35,
              status: "open",
              contractId: bought.contractId,
              note: `key:${key}`,
              execution: "live",
              current_price: setup.entry,
              unrealized_pnl: 0,
              expires_at,
              duration: dur,
              durationUnit: unit,
              mode: "RISEFALL",
            });
            seen.add(key);
            openCount += 1;
            await logEvent({
              stage: "fill",
              status: "ok",
              symbol: info.symbol,
              message: `LIVE FILL ${bought.contractId} ${bought.contract_type || setup.side} ${setup.duration}${setup.durationUnit} stake=${setup.stake || 0.35} · ${accountMode}`,
            });
            await snapAccount(deriv, accountMode);
          } catch (err) {
            tradePlaced = await saveTrade({
              ...setup,
              stake: setup.stake || MIN_STAKE || 0.35,
              status: "paper",
              note: `key:${key} | paper: ${err.message}`,
              execution: "paper",
              current_price: setup.entry,
              unrealized_pnl: 0,
              pnl: null,
              mode: "RISEFALL",
            });
            seen.add(key);
            await logEvent({
              stage: "fill",
              status: "fail",
              symbol: info.symbol,
              message: `Paper only (${mode}): ${err.message}`,
            });
          }
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

    await snapAccount(deriv, accountMode);
    const bal = deriv.balance;
    deriv.close();
    return res.status(200).json({
      ok: true,
      ms: Date.now() - started,
      results,
      tradePlaced,
      openManaged,
      account: {
        mode: accountMode,
        loginid: deriv.loginid,
        balance: bal,
        currency: deriv.currency,
        isDemo: !!deriv.isDemo,
      },
    });
  } catch (err) {
    try {
      await logEvent({ stage: "fatal", status: "fail", message: err.message });
    } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message, ms: Date.now() - started });
  }
}
