#!/usr/bin/env node
// Reef Keeper Apex Connector v4.2.0
// Runs at home, reads the local Apex /rest/status endpoint, and pushes normalized telemetry to Reef Keeper Cloud.

const config = {
  apexBaseUrl: clean(process.env.APEX_BASE_URL || 'http://apex.local'),
  apexUsername: process.env.APEX_USERNAME || '',
  apexPassword: process.env.APEX_PASSWORD || '',
  apexCookie: process.env.APEX_COOKIE || '',
  reefKeeperUrl: clean(process.env.REEF_KEEPER_URL || ''),
  reefKeeperEndpoint: clean(process.env.REEF_KEEPER_TELEMETRY_ENDPOINT || ''),
  reefKeeperToken: process.env.REEF_KEEPER_TOKEN || '',
  pollSeconds: Math.max(15, Number(process.env.APEX_POLL_SECONDS || 60)),
  once: process.argv.includes('--once')
};

function clean(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function nowIso() { return new Date().toISOString(); }
function statusCode(status) { return Array.isArray(status) ? String(status[0] || '') : String(status || ''); }
function stateHuman(status) {
  const s = statusCode(status).toUpperCase();
  if (s === 'AON') return 'AUTO/ON';
  if (s === 'AOF') return 'AUTO/OFF';
  return s || 'unknown';
}
function isOn(status) { return ['ON','AON'].includes(statusCode(status).toUpperCase()); }
function isOff(status) { return ['OFF','AOF'].includes(statusCode(status).toUpperCase()); }
function inputProbeMap(inputs = []) {
  const out = {};
  for (const item of Array.isArray(inputs) ? inputs : []) {
    const type = String(item.type || '').toLowerCase();
    const name = String(item.name || '').toLowerCase();
    const did = String(item.did || '').toLowerCase();
    const val = num(item.value);
    if (val === null) continue;
    if (type === 'temp' || name === 'tmp' || name.includes('temp') || did.includes('temp')) out.temp = val;
    if (type === 'ph' || name === 'ph' || did.includes('ph')) out.ph = val;
    if (type === 'orp' || name === 'orp' || did.includes('orp')) out.orp = val;
    if (type === 'cond' || type === 'salinity' || name.includes('sal') || name.includes('cond')) out.salinity = val;
  }
  return out;
}
function normalizeApexStatus(raw) {
  const system = raw.system || {};
  const nstat = raw.nstat || {};
  const probes = inputProbeMap(raw.inputs || []);
  const outlets = (Array.isArray(raw.outputs) ? raw.outputs : [])
    .filter(o => o && String(o.type || '').toLowerCase() !== 'alert')
    .map(o => ({
      name: String(o.name || o.did || 'Outlet'),
      state: stateHuman(o.status),
      statusCode: statusCode(o.status),
      isOn: isOn(o.status),
      isOff: isOff(o.status),
      type: String(o.type || ''),
      did: String(o.did || o.ID || '')
    }));
  const alarms = [];
  for (const o of Array.isArray(raw.outputs) ? raw.outputs : []) {
    if (String(o.type || '').toLowerCase() === 'alert' && isOn(o.status)) alarms.push(`${o.name || 'Alert'} is ${stateHuman(o.status)}`);
  }
  for (const i of Array.isArray(raw.inputs) ? raw.inputs : []) {
    if (/leak/i.test(String(i.name || '')) && Number(i.value) !== 0) alarms.push(`${i.name} detected water`);
  }
  return {
    schemaVersion: 3,
    driver: 'apex-connector-push',
    source: 'Reef Keeper Apex Connector',
    capturedAt: system.date ? new Date(Number(system.date) * 1000).toISOString() : nowIso(),
    probes,
    outlets,
    alarms,
    system: {
      hostname: system.hostname || nstat.hostname || 'apex',
      software: system.software || '',
      type: system.type || '',
      ipaddr: nstat.ipaddr || '',
      fusionEnable: Boolean(nstat.fusionEnable),
      wifiQuality: num(nstat.quality),
      wifiStrength: num(nstat.strength)
    }
  };
}
function authHeaders() {
  const headers = { Accept:'application/json, text/javascript, */*; q=0.01', 'X-Requested-With':'XMLHttpRequest', 'accept-version':'1' };
  if (config.apexCookie) headers.Cookie = config.apexCookie;
  if (config.apexUsername && config.apexPassword && !config.apexCookie) {
    headers.Authorization = 'Basic ' + Buffer.from(`${config.apexUsername}:${config.apexPassword}`).toString('base64');
  }
  return headers;
}
async function fetchApexStatus() {
  const url = `${config.apexBaseUrl}/rest/status?_=${Date.now()}`;
  const response = await fetch(url, { headers: authHeaders() });
  const text = await response.text();
  if (!response.ok) throw new Error(`Apex returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); }
  catch(error) { throw new Error(`Apex did not return JSON. First bytes: ${text.slice(0, 160)}`); }
}
function telemetryEndpoint() {
  if (config.reefKeeperEndpoint) return config.reefKeeperEndpoint;
  if (config.reefKeeperUrl) return `${config.reefKeeperUrl}/api/telemetry`;
  return '';
}
async function pushTelemetry(snapshot) {
  const url = telemetryEndpoint();
  if (!url) throw new Error('Set REEF_KEEPER_TELEMETRY_ENDPOINT to the stable /api/telemetry URL, or set REEF_KEEPER_URL to the stable app URL.');
  const headers = { 'Content-Type':'application/json' };
  if (config.reefKeeperToken) headers.Authorization = `Bearer ${config.reefKeeperToken}`;
  const response = await fetch(url, { method:'POST', headers, body: JSON.stringify(snapshot) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Reef Keeper returned HTTP ${response.status}`);
  return data;
}
async function tick() {
  const raw = await fetchApexStatus();
  const snapshot = normalizeApexStatus(raw);
  const result = await pushTelemetry(snapshot);
  const p = snapshot.probes || {};
  console.log(`[${new Date().toLocaleString()}] pushed Apex telemetry: temp=${p.temp ?? '—'} pH=${p.ph ?? '—'} ORP=${p.orp ?? '—'} outlets=${snapshot.outlets.length} durable=${result.durable !== false}`);
}
function validate() {
  if (!config.apexBaseUrl) throw new Error('APEX_BASE_URL is required.');
  if (!telemetryEndpoint()) throw new Error('REEF_KEEPER_TELEMETRY_ENDPOINT or REEF_KEEPER_URL is required.');
  if (!config.apexCookie && (!config.apexUsername || !config.apexPassword)) {
    console.warn('No APEX_USERNAME/APEX_PASSWORD or APEX_COOKIE set. The request may fail if Apex requires login.');
  }
}

validate();
try {
  await tick();
  if (!config.once) setInterval(() => tick().catch(err => console.error(`[${new Date().toLocaleString()}]`, err.message)), config.pollSeconds * 1000);
} catch(error) {
  console.error(error.message);
  process.exitCode = 1;
}
