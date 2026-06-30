const APEX_STATUS_KEY = "reefkeeper:apex:latest";

function readBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }

  const response = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`KV set failed ${response.status}: ${text}`);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const expectedSecret = process.env.REEF_CONNECTOR_SECRET;
    if (!expectedSecret) {
      return res.status(500).json({
        ok: false,
        error: "Server missing REEF_CONNECTOR_SECRET",
      });
    }

    const bearerToken = readBearerToken(req);
    const headerToken = req.headers["x-reef-connector-secret"];
    const providedSecret = bearerToken || headerToken || "";

    if (providedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const payload = req.body || {};
    const receivedAt = new Date().toISOString();

    const record = {
      ok: true,
      receivedAt,
      connectorVersion: payload.connectorVersion || null,
      piTimestamp: payload.piTimestamp || null,
      apexSourceUrl: payload.apexSourceUrl || null,
      source: payload.apexSourceUrl || "unknown",
      probes: payload.probes || [],
      inputs: payload.inputs || [],
      outputs: payload.outputs || [],
      raw: payload.raw || null,
      rawText: payload.rawText || null,
    };

    await kvSet(APEX_STATUS_KEY, record);

    return res.status(200).json({
      ok: true,
      received: receivedAt,
      source: record.source,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || String(error),
    });
  }
}
