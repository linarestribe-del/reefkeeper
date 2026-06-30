const APEX_STATUS_KEY = "reefkeeper:apex:latest";

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }

  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV get failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const result = data.result;

  if (!result) return null;

  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  return result;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const record = await kvGet(APEX_STATUS_KEY);

    if (!record) {
      return res.status(200).json({
        ok: false,
        error: "No Apex status has been received yet",
      });
    }

    return res.status(200).json(record);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || String(error),
    });
  }
}
