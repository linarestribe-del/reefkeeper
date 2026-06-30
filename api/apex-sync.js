const APEX_STATUS_KEY = "reefkeeper:apex:latest";

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }

  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV set failed ${res.status}: ${text}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const expectedSecret = process.env.REEF_CONNECTOR_SECRET;
    const providedSecret = req.headers["x-reef-connector-secret"];

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const payload = req.body || {};
    const now = new Date().toISOString();

    const record = {
      ok: true,
      received: now,
      source: payload.source || "unknown",
      apex: payload.apex || payload,
    };

    await kvSet(APEX_STATUS_KEY, record);

    return res.status(200).json({
      ok: true,
      received: now,
      source: record.source,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || String(error),
    });
  }
}
