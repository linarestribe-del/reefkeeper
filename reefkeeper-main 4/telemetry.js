// Reef Keeper v4.1.1 Connector Push telemetry endpoint
// Stores latest normalized telemetry in Vercel KV/Upstash when configured.
// Required for durable cloud sync:
// - KV_REST_API_URL
// - KV_REST_API_TOKEN
// Recommended auth:
// - REEF_TELEMETRY_WRITE_TOKEN for POST
// - REEF_TELEMETRY_READ_TOKEN for GET, optional

const LATEST_KEY = 'reef:telemetry:latest';
const HISTORY_KEY = 'reef:telemetry:history';
const MAX_HISTORY = 240;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Reef-Telemetry-Token');
  res.setHeader('Cache-Control', 'no-store');
}

function bearer(req) {
  const h = req.headers.authorization || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return String(req.headers['x-reef-telemetry-token'] || '').trim();
}

function requireToken(req, expected) {
  if (!expected) return true;
  return bearer(req) === expected;
}

function nowIso() { return new Date().toISOString(); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function compact(value, max = 180) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}
function safeOutlet(o) {
  if (!o || typeof o !== 'object') return null;
  const name = compact(o.name || o.output || o.did || o.id || '', 80);
  if (!name) return null;
  return {
    name,
    state: compact(o.state || o.statusCode || (Array.isArray(o.status) ? o.status[0] : o.status) || 'unknown', 40),
    statusCode: compact(o.statusCode || (Array.isArray(o.status) ? o.status[0] : o.status) || '', 20),
    isOn: Boolean(o.isOn),
    isOff: Boolean(o.isOff),
    type: compact(o.type || '', 40),
    did: compact(o.did || o.ID || o.id || '', 60),
    ok: o.ok !== false
  };
}
function normalizePayload(input) {
  const body = input && typeof input === 'object' ? input : {};
  const probes = body.probes || body.inputs || body.status?.probes || {};
  const outlets = Array.isArray(body.outlets) ? body.outlets : (Array.isArray(body.outputs) ? body.outputs : []);
  return {
    schemaVersion: 3,
    driver: compact(body.driver || body.source || 'connector-push', 80),
    source: compact(body.source || 'Reef Keeper Connector', 120),
    capturedAt: body.capturedAt || body.timestamp || nowIso(),
    receivedAt: nowIso(),
    probes: {
      temp: num(probes.temp ?? probes.temperature ?? probes.tmp),
      ph: num(probes.ph ?? probes.pH),
      orp: num(probes.orp ?? probes.ORP),
      salinity: num(probes.salinity ?? probes.sal ?? probes.conductivity)
    },
    outlets: outlets.map(safeOutlet).filter(Boolean).slice(0, 160),
    alarms: Array.isArray(body.alarms) ? body.alarms.map(a => compact(typeof a === 'string' ? a : (a.message || a.name || JSON.stringify(a)), 160)).filter(Boolean).slice(0, 40) : [],
    system: body.system && typeof body.system === 'object' ? {
      hostname: compact(body.system.hostname || '', 80),
      software: compact(body.system.software || '', 80),
      type: compact(body.system.type || '', 40),
      ipaddr: compact(body.system.ipaddr || '', 80),
      fusionEnable: Boolean(body.system.fusionEnable),
      wifiQuality: num(body.system.wifiQuality),
      wifiStrength: num(body.system.wifiStrength)
    } : {}
  };
}

async function kvPipeline(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `KV request failed with HTTP ${response.status}`);
  return data;
}

function memoryStore() {
  globalThis.__reefTelemetryMemory = globalThis.__reefTelemetryMemory || { latest:null, history:[] };
  return globalThis.__reefTelemetryMemory;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      if (!requireToken(req, process.env.REEF_TELEMETRY_WRITE_TOKEN)) {
        return res.status(401).json({ error:'Invalid telemetry write token.' });
      }
      const snapshot = normalizePayload(req.body || {});
      const stored = { ok:true, snapshot, storedAt:nowIso() };
      const kv = await kvPipeline([
        ['SET', LATEST_KEY, JSON.stringify(stored)],
        ['LPUSH', HISTORY_KEY, JSON.stringify(stored)],
        ['LTRIM', HISTORY_KEY, '0', String(MAX_HISTORY - 1)]
      ]);
      if (!kv) {
        const mem = memoryStore();
        mem.latest = stored;
        mem.history.unshift(stored);
        mem.history = mem.history.slice(0, MAX_HISTORY);
        return res.status(200).json({ ...stored, durable:false, warning:'Vercel KV is not configured; stored only in temporary server memory.' });
      }
      return res.status(200).json({ ...stored, durable:true });
    }

    if (req.method === 'GET') {
      const readToken = process.env.REEF_TELEMETRY_READ_TOKEN;
      const writeToken = process.env.REEF_TELEMETRY_WRITE_TOKEN;
      if (readToken && ![readToken, writeToken].includes(bearer(req))) {
        return res.status(401).json({ error:'Invalid telemetry read token.' });
      }
      const kv = await kvPipeline([['GET', LATEST_KEY]]);
      if (kv) {
        const raw = kv?.[0]?.result;
        if (!raw) return res.status(200).json({ ok:false, snapshot:null, message:'No telemetry has been pushed yet.' });
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return res.status(200).json(parsed);
      }
      const mem = memoryStore();
      if (!mem.latest) return res.status(200).json({ ok:false, snapshot:null, durable:false, message:'No telemetry has been pushed yet, and Vercel KV is not configured.' });
      return res.status(200).json({ ...mem.latest, durable:false });
    }

    return res.status(405).json({ error:'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error:error.message || 'Telemetry endpoint error.' });
  }
}
