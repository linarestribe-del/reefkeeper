const APEX_STATUS_KEY = "reefkeeper:apex:latest";
const SAFE_SOURCE_LABEL = "Apex via Raspberry Pi";
const MAX_APEX_ITEMS = 160;

// The browser currently expects raw.istat.inputs/outputs. Keep that small
// compatibility shape, but never retain the controller's complete raw payload.
const ALLOWED_INPUT_NAMES = new Set([
  "Tmp", "pH", "ORP",
  "Volt_2", "Volt_5",
  "Return1W", "Return2W", "UVpumpW", "SkimmerW",
  "LMP40W", "RMP40W", "FilterRollerW", "ATOW",
  "KalkstirrerW", "KalkpumpW", "NOPOXW", "FanW",
  "Heat1W", "Heat2W",
  "Leak1", "Leak2", "Leak3"
]);

const ALLOWED_OUTPUT_NAMES = new Set([
  "Return1", "Return2", "UVpump", "UVlight", "Skimmer",
  "LMP40", "RMP40", "FilterRoller", "GFO", "ATO",
  "Kalkstirrer", "Kalkpump", "NOPOX", "Fan", "Heat1", "Heat2"
]);

function readBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

function cleanText(value, maxLength = 96) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, maxLength);
}

function cleanValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().slice(0, 80);
  return null;
}

function firstNonEmptyArray(...values) {
  const populated = values.find(value => Array.isArray(value) && value.length > 0);
  if (populated) return populated;
  const empty = values.find(Array.isArray);
  return empty || [];
}

function sanitizeInput(item) {
  if (!item || typeof item !== "object") return null;
  const name = cleanText(item.name, 64);
  if (!ALLOWED_INPUT_NAMES.has(name)) return null;
  const type = cleanText(item.type, 40);
  const value = cleanValue(item.value);
  return {
    name,
    ...(type ? { type } : {}),
    value
  };
}

function isAllowedOutputName(name) {
  return ALLOWED_OUTPUT_NAMES.has(name) || /alarm|warn|heaterror/i.test(name);
}

function sanitizeOutput(item) {
  if (!item || typeof item !== "object") return null;
  const name = cleanText(item.name, 64);
  if (!name || !isAllowedOutputName(name)) return null;
  const rawStatus = Array.isArray(item.status) ? item.status : [item.status];
  const status = rawStatus
    .map(value => cleanText(value, 24))
    .filter(Boolean)
    .slice(0, 4);
  const type = cleanText(item.type, 40);
  return {
    name,
    ...(type ? { type } : {}),
    status
  };
}

function sanitizeApexRecord(payload, receivedAt) {
  const source = payload && typeof payload === "object" ? payload : {};
  const rawIstat = source.raw && typeof source.raw === "object" && source.raw.istat && typeof source.raw.istat === "object"
    ? source.raw.istat
    : {};

  const inputSource = firstNonEmptyArray(source.inputs, rawIstat.inputs);
  const outputSource = firstNonEmptyArray(source.outputs, rawIstat.outputs);

  const inputs = inputSource
    .map(sanitizeInput)
    .filter(Boolean)
    .slice(0, MAX_APEX_ITEMS);

  const outputs = outputSource
    .map(sanitizeOutput)
    .filter(Boolean)
    .slice(0, MAX_APEX_ITEMS);

  const probeNames = new Set(["Tmp", "pH", "ORP"]);
  const probes = inputs.filter(item => probeNames.has(item.name));

  return {
    ok: true,
    receivedAt,
    connectorVersion: cleanText(source.connectorVersion, 40) || null,
    piTimestamp: cleanText(source.piTimestamp, 64) || null,
    source: SAFE_SOURCE_LABEL,
    probes,
    inputs,
    outputs,
    raw: {
      istat: {
        inputs,
        outputs
      }
    }
  };
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

    const receivedAt = new Date().toISOString();
    const record = sanitizeApexRecord(req.body || {}, receivedAt);

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
