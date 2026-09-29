const WebSocket = require("ws");

const APP_ID = process.env.DERIV_APP_ID || "1089";
const TOKEN = process.env.DERIV_TOKEN || "";
const WS_URL = process.env.DERIV_WS || `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

class DerivClient {
  constructor() {
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
    this.authorized = false;
    this.loginid = null;
    this.balance = null;
    this.currency = "USD";
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      const timer = setTimeout(() => {
        try { this.ws.terminate(); } catch {}
        reject(new Error("Deriv connection timeout"));
      }, 12000);
      this.ws.on("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      this.ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        if (msg.req_id && this.pending.has(msg.req_id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.req_id);
          this.pending.delete(msg.req_id);
          if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
          else res(msg);
        }
      });
    });
  }

  request(payload) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WS not open"));
      }
      const id = this.reqId++;
      payload.req_id = id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 15000);
    });
  }

  async authorize() {
    if (!TOKEN) throw new Error("DERIV_TOKEN not set");
    const msg = await this.request({ authorize: TOKEN });
    if (msg.error) throw new Error(msg.error.message);
    this.authorized = true;
    this.loginid = msg.authorize.loginid;
    this.balance = msg.authorize.balance;
    this.currency = msg.authorize.currency || "USD";
    return msg.authorize;
  }

  async fetchCandles(symbol, granularity, count = 160) {
    const msg = await this.request({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: "latest",
      style: "candles",
      granularity,
    });
    if (msg.error) return [];
    return (msg.candles || []).map((c) => ({
      epoch: Number(c.epoch),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));
  }

  async loadFrames(symbol) {
    const frames = {};
    const map = [
      ["h4", 14400], ["h1", 3600], ["m15", 900],
      ["m5", 300], ["m3", 180], ["m1", 60],
    ];
    for (const [tf, gran] of map) {
      frames[tf] = await this.fetchCandles(symbol, gran, tf === "m1" ? 100 : 120);
      await new Promise((r) => setTimeout(r, 200));
    }
    return frames;
  }

  async proposalAndBuy(side, symbol, amount, rr) {
    const contract_type = side === "buy" ? "MULTUP" : "MULTDOWN";
    const prop = await this.request({
      proposal: 1,
      amount,
      basis: "stake",
      contract_type,
      currency: this.currency,
      symbol,
      multiplier: 20,
      limit_order: {
        stop_loss: amount,
        take_profit: Math.round(amount * Math.min(rr, 8) * 100) / 100,
      },
    });
    if (prop.error) throw new Error(prop.error.message || "proposal failed");
    const p = prop.proposal;
    const buy = await this.request({ buy: p.id, price: p.ask_price });
    if (buy.error) throw new Error(buy.error.message || "buy failed");
    return {
      contractId: String(buy.buy.contract_id),
      buyPrice: Number(buy.buy.buy_price),
    };
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch {}
    this.ws = null;
  }
}

module.exports = { DerivClient };
