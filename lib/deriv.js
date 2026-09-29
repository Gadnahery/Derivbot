const WebSocket = require("ws");

const APP_ID = process.env.DERIV_APP_ID || "1089";
const TOKEN = process.env.DERIV_TOKEN || "";
const WS_FALLBACK = process.env.DERIV_WS || `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const REST = "https://api.derivws.com";

class DerivClient {
  constructor() {
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
    this.authorized = false;
    this.loginid = null;
    this.balance = null;
    this.currency = "USD";
    this.wsUrl = WS_FALLBACK;
  }

  async resolveSessionUrl() {
    if (!TOKEN || !TOKEN.startsWith("pat_")) {
      return WS_FALLBACK;
    }
    try {
      const accRes = await fetch(`${REST}/trading/v1/options/accounts`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Deriv-App-ID": APP_ID,
          Accept: "application/json",
        },
      });
      const accText = await accRes.text();
      if (!accRes.ok) {
        console.error("accounts error", accRes.status, accText.slice(0, 200));
        return WS_FALLBACK;
      }
      let accounts = [];
      try {
        const j = JSON.parse(accText);
        accounts = (j.data || []).map((a) => {
          const id = String(a.account_id ?? a.id ?? a.loginid ?? "");
          const type = String(a.account_type || "").toLowerCase();
          const isDemo =
            type === "demo" ||
            Boolean(a.is_virtual ?? a.is_demo) ||
            id.startsWith("VR") ||
            id.startsWith("VRTC") ||
            id.startsWith("DT") ||
            id.startsWith("DOT") ||
            id.startsWith("VRT");
          return {
            id,
            isDemo,
            currency: a.currency ? String(a.currency) : "USD",
            balance: a.balance != null ? Number(a.balance) : null,
          };
        }).filter((a) => a.id);
      } catch {
        return WS_FALLBACK;
      }
      if (!accounts.length) {
        console.error("no accounts for PAT");
        return WS_FALLBACK;
      }
      const demo = accounts.find((a) => a.isDemo) || accounts[0];
      this.loginid = demo.id;
      this.currency = demo.currency || "USD";
      this.balance = demo.balance;

      const otpRes = await fetch(
        `${REST}/trading/v1/options/accounts/${encodeURIComponent(demo.id)}/otp`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Deriv-App-ID": APP_ID,
            Accept: "application/json",
          },
        }
      );
      const otpText = await otpRes.text();
      if (!otpRes.ok) {
        console.error("otp error", otpRes.status, otpText.slice(0, 200));
        return WS_FALLBACK;
      }
      try {
        const j = JSON.parse(otpText);
        const url = j.data?.url || j.url;
        if (url) {
          this.wsUrl = url;
          return url;
        }
      } catch {}
      return WS_FALLBACK;
    } catch (e) {
      console.error("resolveSessionUrl", e.message);
      return WS_FALLBACK;
    }
  }

  connect(url) {
    const target = url || this.wsUrl || WS_FALLBACK;
    this.wsUrl = target;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(target);
      const timer = setTimeout(() => {
        try { this.ws.terminate(); } catch {}
        reject(new Error("Deriv connection timeout"));
      }, 15000);
      this.ws.on("open", () => {
        clearTimeout(timer);
        if (target.includes("otp=") || target.includes("/options/ws/")) {
          this.authorized = true;
        }
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

    const url = await this.resolveSessionUrl();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(url);
    }

    if (this.authorized && this.loginid) {
      return { loginid: this.loginid, balance: this.balance, currency: this.currency };
    }

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
