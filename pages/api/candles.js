const { DerivClient } = require("../../lib/deriv");

const TF_MAP = {
  m1: 60,
  m3: 180,
  m5: 300,
  m15: 900,
  h1: 3600,
  h4: 14400,
};

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "frxEURUSD");
  const tf = String(req.query.tf || "m15");
  const gran = TF_MAP[tf] || 900;
  const count = Math.min(300, Number(req.query.count) || 150);

  try {
    const deriv = new DerivClient();
    await deriv.authorize();
    const candles = await deriv.fetchCandles(symbol, gran, count);
    deriv.close();
    return res.status(200).json({
      ok: true,
      symbol,
      tf,
      candles: candles.map((c) => ({
        time: c.epoch,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
