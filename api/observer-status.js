// Reef Keeper Build 2E — Aquarium Observer metadata bridge
// Stores the latest sanitized status and selected remote image reference in Vercel KV.
// Full camera archives remain on the Raspberry Pi drive; image bytes are not accepted here.

const LATEST_KEY = 'reef:observer:latest';
const SCHEMA_VERSION = 1;

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Reef-Observer-Token');
}

function bearer(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-reef-observer-token'] || '').trim();
}

function expectedWriteToken() {
  return process.env.REEF_OBSERVER_WRITE_TOKEN || process.env.REEF_TELEMETRY_WRITE_TOKEN || process.env.REEF_CONNECTOR_SECRET || '';
}

function cleanString(value, max = 180) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeHttpUrl(value) {
  const text = cleanString(value, 1600);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function safeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePayload(input) {
  const body = input && typeof input === 'object' ? input : {};
  const forbiddenImageBytes = body.imageDataUrl || body.imageBase64 || body.imageBytes || body.thumbnailDataUrl;
  if (forbiddenImageBytes) throw new Error('Image bytes are not accepted. Upload the selected thumbnail to private object storage and send only its HTTPS reference.');

  const record = {
    schemaVersion: SCHEMA_VERSION,
    configured: true,
    ok: body.ok !== false,
    receivedAt: new Date().toISOString(),
    capturedAt: safeIso(body.capturedAt || body.captured_at || body.capturedAtLocal || body.captured_at_local),
    cameraLabel: cleanString(body.cameraLabel || body.camera?.label || 'Sump camera', 80),
    stream: cleanString(body.stream || body.camera?.stream || 'stream2', 30),
    resolution: cleanString(body.resolution || body.camera?.resolution || '1280×720', 40),
    captureIntervalMinutes: Math.max(1, Math.min(1440, finiteNumber(body.captureIntervalMinutes || body.intervalMinutes) || 5)),
    sizeBytes: Math.max(0, finiteNumber(body.sizeBytes ?? body.size_bytes) || 0),
    durationSeconds: Math.max(0, finiteNumber(body.durationSeconds ?? body.duration_seconds) || 0),
    thumbnailUrl: safeHttpUrl(body.thumbnailUrl || body.imageUrl || body.latestImageUrl),
    storage: {
      label: cleanString(body.storage?.label || body.storageLabel || 'Local Pi drive', 80),
      totalBytes: Math.max(0, finiteNumber(body.storage?.totalBytes) || 0),
      availableBytes: Math.max(0, finiteNumber(body.storage?.availableBytes) || 0),
      usedPercent: Math.max(0, Math.min(100, finiteNumber(body.storage?.usedPercent) || 0))
    },
    message: cleanString(body.message || body.error || '', 240)
  };

  // Do not store camera credentials, RTSP URLs, local file paths, or home-network addresses.
  return record;
}

async function kvPipeline(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const response = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `KV request failed with HTTP ${response.status}`);
  return data;
}

function memoryStore() {
  globalThis.__reefObserverMemory = globalThis.__reefObserverMemory || { latest: null };
  return globalThis.__reefObserverMemory;
}

export default async function handler(req, res) {
  setResponseHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const token = expectedWriteToken();
      if (!token) return res.status(500).json({ ok: false, error: 'Server missing Observer write token.' });
      if (bearer(req) !== token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      const record = normalizePayload(req.body || {});
      const kv = await kvPipeline([['SET', LATEST_KEY, JSON.stringify(record)]]);
      if (!kv) {
        memoryStore().latest = record;
        return res.status(200).json({ ok: true, receivedAt: record.receivedAt, durable: false, warning: 'Vercel KV is not configured; stored only in temporary server memory.' });
      }
      return res.status(200).json({ ok: true, receivedAt: record.receivedAt, durable: true });
    }

    if (req.method === 'GET') {
      const kv = await kvPipeline([['GET', LATEST_KEY]]);
      let record = null;
      if (kv) {
        const raw = kv?.[0]?.result;
        if (raw) record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } else {
        record = memoryStore().latest;
      }

      if (!record) {
        return res.status(200).json({
          schemaVersion: SCHEMA_VERSION,
          configured: false,
          ok: false,
          state: 'awaiting_remote_bridge',
          captureIntervalMinutes: 5,
          cameraLabel: 'Sump camera',
          stream: 'stream2',
          resolution: '1280×720',
          storage: { label: 'Local Pi drive' },
          message: 'The app-side Aquarium Observer is ready, but the Raspberry Pi remote bridge has not been connected yet.'
        });
      }

      return res.status(200).json(record);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, configured: true, error: error.message || 'Observer endpoint error.' });
  }
}
