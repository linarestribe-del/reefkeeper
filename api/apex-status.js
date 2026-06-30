import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const APEX_STATUS_KEY = "reefkeeper:apex:latest";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const record = await redis.get(APEX_STATUS_KEY);

    if (!record) {
      return res.status(200).json({
        ok: false,
        error: "No Apex status has been received yet",
      });
    }

    return res.status(200).json(record);
  } catch (error) {
    console.error("apex-status failed", error);
    return res.status(500).json({
      ok: false,
      error: error.message || String(error),
    });
  }
}
}
