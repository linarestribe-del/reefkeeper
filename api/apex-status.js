const APEX_STATUS_KEY = "reefkeeper:apex:latest";
const SAFE_SOURCE_LABEL = "Apex via Raspberry Pi";
const MAX_APEX_ITEMS = 160;

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

function sanitizeStoredRecord(record) {
  const source = record && typeof record === "object" ? record : {};
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
    ok: source.ok !== false,
    receivedAt: cleanText(source.receivedAt, 64) || null,
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

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }

  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`KV get failed ${response.status}: ${text}`);
  }

  const data = JSON.parse(text);
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
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const record = await kvGet(APEX_STATUS_KEY);

    if (!record) {
      return res.status(200).json({
        ok: false,
        error: "No Apex status has been received yet",
      });
    }

    // Sanitize again on every read so an older KV record can never expose the
    // previously stored controller metadata while the Pi waits for its next sync.
    return res.status(200).json(sanitizeStoredRecord(record));
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || String(error),
    });
  }
}
