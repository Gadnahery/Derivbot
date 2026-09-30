const webpush = require("web-push");

const publicKey =
  process.env.VAPID_PUBLIC_KEY ||
  "BKCyIlxwHrtl0pbSmq_VDvGDbVithfcwOMlMd4qedbzWf3DUntTvoXT1eP8T7rSeryMqQGirOw_0E1UL9Pf6Phw";
const privateKey =
  process.env.VAPID_PRIVATE_KEY ||
  "FzMkQhD3xR3srYeUmHqpLp0jkuTI-uaBGbOklHB6U4Q";
const subject = process.env.VAPID_SUBJECT || "mailto:gadnahery7@gmail.com";

let configured = false;
function ensure() {
  if (configured) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

function getPublicKey() {
  return publicKey;
}

async function sendPushToAll(sb, payload) {
  ensure();
  const { data: subs } = await sb.from("push_subscriptions").select("*").limit(200);
  if (!subs?.length) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
        { TTL: 3600, urgency: "high" }
      );
      sent += 1;
    } catch (e) {
      failed += 1;
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
      console.error("push fail", e.statusCode || e.message);
    }
  }
  return { sent, failed };
}

function buildSignalPayload(setup, info, criteria) {
  const side = (setup.side || "").toUpperCase();
  const mt5 = info.mt5 || info.name;
  const title = `${side} ${mt5} · ${Number(setup.rr).toFixed(1)}R`;
  const body = [
    `Entry ${setup.entry}`,
    `SL ${setup.sl}`,
    `TP ${setup.tp}`,
    `Bias ${setup.bias || criteria?.bias || "—"}`,
    "Open desk for full criteria · execute on MT5",
  ].join(" · ");
  return {
    title,
    body,
    url: "/signals",
    tag: `signal-${setup.symbol}-${setup.c2Epoch || Date.now()}`,
    data: {
      symbol: setup.symbol,
      mt5,
      side: setup.side,
      entry: setup.entry,
      sl: setup.sl,
      tp: setup.tp,
      rr: setup.rr,
    },
  };
}

module.exports = { getPublicKey, sendPushToAll, buildSignalPayload };
