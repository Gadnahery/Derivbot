const WebSocket = require("ws");

const APP_ID = process.env.DERIV_APP_ID || "1089";
const TOKEN = process.env.DERIV_TOKEN || "";
const WS_FALLBACK = process.env.DERIV_WS || `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const REST = "https://api.derivws.com";

class DerivClient {
  constructor(opts = {}) {
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
    this.authorized = false;
    this.loginid = null;
    this.balance = null;
    this.currency = "USD";
    this.wsUrl = WS_FALLBACK;
    // "demo" | "live"
    this.accountMode = (opts.accountMode || "demo").toLowerCase() === "live" ? "live" : "demo";
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
      this.accounts = accounts;
      let chosen;
      if (this.accountMode === "live") {
        chosen = accounts.find((a) => !a.isDemo) || accounts[0];
      } else {
        chosen = accounts.find((a) => a.isDemo) || accounts[0];
      }
      this.loginid = chosen.id;
      this.currency = chosen.currency || "USD";
      this.balance = chosen.balance;
      this.isDemo = !!chosen.isDemo;

      const otpRes = await fetch(
        `${REST}/trading/v1/options/accounts/${encodeURIComponent(chosen.id)}/otp`,
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

    // OTP sessions are pre-authorized; still refresh balance every time
    if (!(this.authorized && this.loginid)) {
      try {
        const msg = await this.request({ authorize: TOKEN });
        if (!msg.error && msg.authorize) {
          this.authorized = true;
          this.loginid = msg.authorize.loginid || this.loginid;
          this.balance = msg.authorize.balance != null ? Number(msg.authorize.balance) : this.balance;
          this.currency = msg.authorize.currency || this.currency || "USD";
        } else {
          this.authorized = true; // OTP path
        }
      } catch {
        this.authorized = true; // OTP path — authorize call may fail
      }
    }

    await this.refreshBalance();
    return { loginid: this.loginid, balance: this.balance, currency: this.currency, isDemo: this.isDemo };
  }

  /** Fresh balance from REST accounts (source of truth for PAT) + WS balance if available */
  async refreshBalance() {
    // 1) REST accounts list
    try {
      const accRes = await fetch(`${REST}/trading/v1/options/accounts`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Deriv-App-ID": APP_ID,
          Accept: "application/json",
        },
      });
      if (accRes.ok) {
        const j = await accRes.json();
        const accounts = j.data || [];
        const match =
          accounts.find((a) => String(a.account_id ?? a.id ?? "") === String(this.loginid)) ||
          accounts.find((a) => {
            const id = String(a.account_id ?? a.id ?? "");
            const type = String(a.account_type || "").toLowerCase();
            const isDemo =
              type === "demo" ||
              id.startsWith("DOT") ||
              id.startsWith("VR");
            return this.accountMode === "live" ? !isDemo : isDemo;
          });
        if (match) {
          const id = String(match.account_id ?? match.id ?? this.loginid);
          const bal = match.balance != null ? Number(match.balance) : null;
          if (bal != null && !Number.isNaN(bal)) this.balance = bal;
          this.loginid = id;
          this.currency = match.currency ? String(match.currency) : this.currency || "USD";
        }
      }
    } catch (e) {
      console.error("refreshBalance REST", e.message);
    }

    // 2) WS balance request (classic)
    try {
      if (this.ws && this.ws.readyState === 1) {
        const msg = await this.request({ balance: 1, account: "current" });
        if (msg.balance && msg.balance.balance != null) {
          this.balance = Number(msg.balance.balance);
          if (msg.balance.currency) this.currency = msg.balance.currency;
          if (msg.balance.loginid) this.loginid = msg.balance.loginid;
        }
      }
    } catch {
      // ignore — REST is enough
    }

    return { balance: this.balance, currency: this.currency, loginid: this.loginid };
  }

  /** Actual Rise/Fall result from Deriv (not guessed from later price). */
  async getContractResult(contractId) {
    if (!contractId) return null;
    try {
      const msg = await this.request({
        proposal_open_contract: 1,
        contract_id: Number(contractId) || contractId,
      });
      if (msg.error) {
        // try profit table / portfolio fallback
        return { error: msg.error.message };
      }
      const c = msg.proposal_open_contract || {};
      const profit = c.profit != null ? Number(c.profit) : null;
      const status = String(c.status || "");
      const isSold = Boolean(c.is_sold);
      const isExpired = Boolean(c.is_expired) || status === "sold" || status === "won" || status === "lost";
      let hit = null;
      if (profit != null && (isSold || isExpired || c.is_settleable)) {
        hit = profit > 0 ? "won" : profit < 0 ? "lost" : "lost";
      }
      return {
        hit,
        profit,
        status,
        isSold,
        isExpired,
        exitPrice: c.exit_tick != null ? Number(c.exit_tick) : c.sell_price != null ? Number(c.sell_price) : null,
        entryPrice: c.entry_tick != null ? Number(c.entry_tick) : null,
        raw: c,
      };
    } catch (e) {
      return { error: e.message };
    }
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

  /**
   * Rise/Fall binary options on synthetics.
   * side: "rise"|"fall" (or buy/sell mapped)
   * duration + unit: e.g. 5, "t" (ticks) or 1, "m" (minutes)
   */
  async buyRiseFall(side, symbol, amount, duration, durationUnit = "t") {
    const s = String(side || "").toLowerCase();
    const contract_type = s === "rise" || s === "buy" || s === "call" ? "CALL" : "PUT";
    // Deriv min stake on RF often 0.35
    const stake = Math.max(0.35, Number(amount) || 0.35);
    const dur = Math.max(1, Number(duration) || 5);
    const unit = durationUnit === "m" || durationUnit === "s" ? durationUnit : "t";
    // Options WS rejects "symbol" — must use underlying_symbol
    const prop = await this.request({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type,
      currency: this.currency || "USD",
      underlying_symbol: symbol,
      duration: dur,
      duration_unit: unit,
    });
    if (prop.error) throw new Error(prop.error.message || "rise/fall proposal failed");
    const pr = prop.proposal;
    const buy = await this.request({ buy: pr.id, price: pr.ask_price });
    if (buy.error) throw new Error(buy.error.message || "rise/fall buy failed");
    return {
      contractId: String(buy.buy.contract_id || buy.buy.transaction_id || pr.id),
      buyPrice: Number(buy.buy.buy_price || pr.ask_price),
      payout: Number(pr.payout || 0),
      contract_type,
      duration: dur,
      duration_unit: unit,
    };
  }

  async proposalAndBuy(side, symbol, amount, rr) {
    const contract_type = side === "buy" ? "MULTUP" : "MULTDOWN";
    const stake = Math.max(Number(amount) || 1, 1);
    const prop = await this.request({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type,
      currency: this.currency || "USD",
      underlying_symbol: symbol,
      multiplier: 100,
      limit_order: {
        stop_loss: stake,
        take_profit: Math.round(stake * Math.min(Number(rr) || 3, 8) * 100) / 100,
      },
    });
    if (prop.error) throw new Error(prop.error.message || "proposal failed");
    const p = prop.proposal;
    const buy = await this.request({ buy: p.id, price: p.ask_price });
    if (buy.error) throw new Error(buy.error.message || "buy failed");
    return {
      contractId: String(buy.buy.contract_id || buy.buy.transaction_id || p.id),
      buyPrice: Number(buy.buy.buy_price || p.ask_price),
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
