const { getSetting, setSetting, getClient } = require("../../lib/supabase");

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const accountMode = (await getSetting("accountMode", "demo")) || "demo";
      return res.status(200).json({ ok: true, accountMode: accountMode === "live" ? "live" : "demo" });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const mode = String(body.accountMode || "").toLowerCase() === "live" ? "live" : "demo";
      const ok = await setSetting("accountMode", mode);
      return res.status(200).json({ ok, accountMode: mode });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
