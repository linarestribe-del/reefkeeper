#!/usr/bin/env node
// Reef Keeper Apex Connector v4.2.1
// Runs at home, reads the local Apex /rest/status endpoint, and pushes normalized telemetry to the stable Reef Keeper telemetry hub.
// v4.2.1 adds session reuse, best-effort Apex login, retry-after-401, connector heartbeat metadata, and clearer diagnostics.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SESSION_FILE = process.env.APEX_SESSION_FILE || join(homedir(), '.reef-keeper', 'apex-session.json');
const CONNECTOR_VERSION = '4.2.1';

const config = {
  apexBaseUrl: clean(process.env.APEX_BASE_URL || 'http://apex.local'),
  apexUsername: process.env.APEX_USERNAME || '',
  apexPassword: process.env.APEX_PASSWORD || '',
  apexCookie: process.env.APEX_COOKIE || '',
  reefKeeperUrl: clean(process.env.REEF_KEEPER_URL || ''),
  reefKeeperEndpoint: clean(process.env.REEF_KEEPER_TELEMETRY_ENDPOINT || ''),
  reefKeeperToken: process.env.REEF_KEEPER_TOKEN || '',
  pollSeconds: Math.max(15, Number(process.env.APEX_POLL_SECONDS || 60)),
  once: process.argv.includes('--once'),
  verbose: process.argv.includes('--verbose') || process.env.REEF_KEEPER_VERBOSE === '1'
};

let sessionCookie = config.apexCookie || '';
let authMode = sessionCookie ? 'env-cookie' : 'none';

function clean(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function nowIso() { return new Date().toISOString(); }
function logVerbose(...args) { if (config.verbose) console.log('[debug]', ...args); }
function statusCode(status) { return Array.isArray(status) ? String(status[0] || '') : String(status || ''); }
function stateHuman(status) {
  const s = statusCode(status).toUpperCase();
  if (s === 'AON') return 'AUTO/ON';
  if (s === 'AOF') return 'AUTO/OFF';
  return s || 'unknown';
}
function isOn(status) { return ['ON','AON'].includes(statusCode(status).toUpperCase()); }
function isOff(status) { return ['OFF','AOF'].includes(statusCode(status).toUpperCase()); }

async function loadSessionCookie() {
  if (sessionCookie) return sessionCookie;
  try {
    if (!existsSync(SESSION_FILE)) return '';
    const saved = JSON.parse(await readFile(SESSION_FILE, 'utf8'));
    if (saved?.apexBaseUrl === config.apexBaseUrl && saved?.cookie) {
      sessionCookie = String(saved.cookie);
      authMode = 'saved-cookie';
      return sessionCookie;
    }
  } catch (_) {}
  return '';
}

async function saveSessionCookie(cookie) {
  if (!cookie) return;
  sessionCookie = cookie;
  try {
    await mkdir(dirname(SESSION_FILE), { recursive:true });
    await writeFile(SESSION_FILE, JSON.stringify({ apexBaseUrl:config.apexBaseUrl, cookie, savedAt:nowIso() }, null, 2));
  } catch (error) {
    logVerbose('Could not save Apex session cookie:', error.message);
  }
}

function extractCookie(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const values = raw.length ? raw : String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/g).filter(Boolean);
  const parts = [];
  for (const line of values) {
    const first = String(line || '').split(';')[0].trim();
    if (first && !parts.includes(first)) parts.push(first);
  }
  return parts.join('; ');
}

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
    receivedAt: nowIso(),
    connector: {
      version: CONNECTOR_VERSION,
      host: 'local-mac',
      authMode,
      pollSeconds: config.pollSeconds,
      pushedAt: nowIso()
    },
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

async function authHeaders({ useBasic = true } = {}) {
  await loadSessionCookie();
  const headers = {
    Accept:'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With':'XMLHttpRequest',
    'accept-version':'1'
  };
  if (sessionCookie) headers.Cookie = sessionCookie;
  if (useBasic && config.apexUsername && config.apexPassword && !sessionCookie) {
    headers.Authorization = 'Basic ' + Buffer.from(`${config.apexUsername}:${config.apexPassword}`).toString('base64');
    authMode = 'basic';
  }
  return headers;
}

async function attemptApexLogin() {
  if (!config.apexUsername || !config.apexPassword) return false;

  const candidates = [
    { path:'/rest/login', type:'json', body:{ login:config.apexUsername, password:config.apexPassword } },
    { path:'/rest/login', type:'json', body:{ username:config.apexUsername, password:config.apexPassword } },
    { path:'/login', type:'form', body:{ login:config.apexUsername, password:config.apexPassword } },
    { path:'/login', type:'form', body:{ username:config.apexUsername, password:config.apexPassword } },
    { path:'/apex/login', type:'form', body:{ login:config.apexUsername, password:config.apexPassword } },
    { path:'/apex/login', type:'form', body:{ username:config.apexUsername, password:config.apexPassword } }
  ];

  for (const candidate of candidates) {
    const url = `${config.apexBaseUrl}${candidate.path}`;
    const headers = { Accept:'application/json, text/plain, */*' };
    let body;
    if (candidate.type === 'json') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(candidate.body);
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(candidate.body).toString();
    }
    try {
      logVerbose('Trying Apex login', candidate.path, candidate.type);
      const response = await fetch(url, { method:'POST', headers, body, redirect:'manual' });
      const cookie = extractCookie(response);
      if (cookie) {
        authMode = `login:${candidate.path}`;
        await saveSessionCookie(cookie);
        logVerbose('Apex login produced session cookie via', candidate.path);
        return true;
      }
    } catch (error) {
      logVerbose('Apex login candidate failed:', candidate.path, error.message);
    }
  }
  return false;
}

async function fetchApexStatus({ retry = true } = {}) {
  const url = `${config.apexBaseUrl}/rest/status?_=${Date.now()}`;
  const response = await fetch(url, { headers: await authHeaders() });
  const cookie = extractCookie(response);
  if (cookie) await saveSessionCookie(cookie);
  const text = await response.text();
  if (response.status === 401 && retry) {
    sessionCookie = '';
    const loggedIn = await attemptApexLogin();
    if (loggedIn) return fetchApexStatus({ retry:false });
  }
  if (!response.ok) throw new Error(`Apex returned HTTP ${response.status}: ${text.slice(0, 220)}\nTip: if automatic login fails, copy a fresh connect.sid cookie into APEX_COOKIE, or run with --verbose to see login attempts.`);
  try { return JSON.parse(text); }
  catch(error) { throw new Error(`Apex did not return JSON. First bytes: ${text.slice(0, 220)}`); }
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
  console.log(`[${new Date().toLocaleString()}] pushed Apex telemetry: temp=${p.temp ?? '—'} pH=${p.ph ?? '—'} ORP=${p.orp ?? '—'} outlets=${snapshot.outlets.length} alarms=${snapshot.alarms.length} durable=${result.durable !== false} auth=${authMode}`);
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
