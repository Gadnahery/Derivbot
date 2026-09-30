const { getClient } = require("../../../lib/supabase");
const { getPublicKey } = require("../../../lib/push");

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, publicKey: getPublicKey() });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { endpoint, keys, userAgent } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription" });
    }
    const sb = getClient();
    const { error } = await sb.from("push_subscriptions").upsert(
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || null,
        at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
