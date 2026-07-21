// Reef Keeper Build 2I — shared Aquarium Observer bridge validation and health normalization

import { timingSafeEqual } from 'node:crypto';

export const OBSERVER_SCHEMA_VERSION = 4;
export const OBSERVER_STATUS_PATH = 'aquarium-observer/status.json';
export const OBSERVER_IMAGE_SLOTS = Object.freeze({
  latest: 'aquarium-observer/latest.jpg',
  previous: 'aquarium-observer/previous.jpg',
  dayAgo: 'aquarium-observer/day-ago.jpg',
  weekAgo: 'aquarium-observer/week-ago.jpg'
});
export const OBSERVER_IMAGE_PATH = OBSERVER_IMAGE_SLOTS.latest;
export const OBSERVER_IMAGE_ROUTE = '/api/observer-image';
export const MAX_OBSERVER_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_OBSERVER_HISTORY_IMAGES = 3;

export function setObserverHeaders(res, methods = 'GET,POST,OPTIONS') {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Reef-Observer-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function readBearer(req) {
  const auth = String(req?.headers?.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req?.headers?.['x-reef-observer-token'] || '').trim();
}

export function expectedObserverWriteToken() {
  return String(
    process.env.REEF_OBSERVER_WRITE_TOKEN ||
    process.env.REEF_TELEMETRY_WRITE_TOKEN ||
    process.env.REEF_CONNECTOR_SECRET ||
    ''
  ).trim();
}

export function secureTokenMatch(provided, expected) {
  const left = Buffer.from(String(provided || '').trim(), 'utf8');
  const right = Buffer.from(String(expected || '').trim(), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function cleanObserverString(value, max = 180) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function observerNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function observerIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseObserverBody(req) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  if (!text.trim()) return {};
  return JSON.parse(text);
}

export function decodeObserverJpeg(value) {
  let encoded = String(value || '').trim();
  const dataUrl = encoded.match(/^data:image\/jpeg;base64,(.*)$/is);
  if (dataUrl) encoded = dataUrl[1];
  encoded = encoded.replace(/\s+/g, '');

  if (!encoded) throw new Error('Missing imageBase64.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('imageBase64 is not valid Base64.');
  if (encoded.length % 4 === 1) throw new Error('imageBase64 has invalid padding.');

  const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
  const image = Buffer.from(padded, 'base64');

  if (!image.length) throw new Error('Decoded image is empty.');
  if (image.length > MAX_OBSERVER_IMAGE_BYTES) {
    throw new Error(`Observer image exceeds the ${MAX_OBSERVER_IMAGE_BYTES}-byte limit.`);
  }
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    throw new Error('Observer upload must be a JPEG image.');
  }
  return image;
}

export function normalizeObserverSlot(value) {
  const slot = String(value || 'latest').trim();
  return Object.prototype.hasOwnProperty.call(OBSERVER_IMAGE_SLOTS, slot) ? slot : null;
}

export function decodeObserverHistoryImages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('historyImages must be an array.');
  const output = [];
  const seen = new Set();
  for (const item of value.slice(0, MAX_OBSERVER_HISTORY_IMAGES)) {
    const slot = normalizeObserverSlot(item?.slot);
    if (!slot || slot === 'latest') throw new Error('History image slot must be previous, dayAgo, or weekAgo.');
    if (seen.has(slot)) continue;
    const capturedAt = observerIso(item?.capturedAt || item?.captured_at);
    if (!capturedAt) throw new Error(`History image ${slot} is missing a valid capturedAt.`);
    output.push({ slot, capturedAt, image: decodeObserverJpeg(item?.imageBase64) });
    seen.add(slot);
  }
  return output;
}

function normalizeComparisonRecord(slot, value) {
  const item = value && typeof value === 'object' ? value : {};
  const capturedAt = observerIso(item.capturedAt || item.captured_at);
  const available = item.available === true && Boolean(capturedAt);
  return {
    slot,
    available,
    capturedAt,
    sizeBytes: Math.max(0, observerNumber(item.sizeBytes ?? item.size_bytes) || 0),
    imageVersion: cleanObserverString(item.imageVersion || capturedAt || '', 100),
    imageUrl: available ? `${OBSERVER_IMAGE_ROUTE}?slot=${encodeURIComponent(slot)}` : ''
  };
}

export function normalizeObserverComparisons(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    previous: normalizeComparisonRecord('previous', source.previous),
    dayAgo: normalizeComparisonRecord('dayAgo', source.dayAgo),
    weekAgo: normalizeComparisonRecord('weekAgo', source.weekAgo)
  };
}


function observerHealthState(value, fallback = 'pending') {
  const state = cleanObserverString(value, 20).toLowerCase();
  return ['healthy', 'attention', 'offline', 'pending'].includes(state) ? state : fallback;
}

function observerBoolean(value) {
  return value === true;
}

function normalizeObserverHealthIssue(value) {
  const item = value && typeof value === 'object' ? value : {};
  const severity = cleanObserverString(item.severity, 20).toLowerCase();
  return {
    code: cleanObserverString(item.code || 'observer_issue', 80),
    severity: ['critical', 'warning', 'info'].includes(severity) ? severity : 'info',
    message: cleanObserverString(item.message, 240)
  };
}

function normalizeObserverHealthComponent(value, fallbackMessage = '') {
  const item = value && typeof value === 'object' ? value : {};
  return {
    status: observerHealthState(item.status, 'pending'),
    message: cleanObserverString(item.message || fallbackMessage, 240)
  };
}

export function normalizeObserverHealth(value) {
  const source = value && typeof value === 'object' ? value : {};
  const captureBase = normalizeObserverHealthComponent(source.capture, 'Waiting for camera health data.');
  const publisherBase = normalizeObserverHealthComponent(source.publisher, 'Waiting for publisher health data.');
  const storageBase = normalizeObserverHealthComponent(source.storage, 'Waiting for storage health data.');
  const powerBase = normalizeObserverHealthComponent(source.power, 'Waiting for Pi power health data.');
  const archiveBase = normalizeObserverHealthComponent(source.archive, 'Waiting for archive health data.');
  const services = source.services && typeof source.services === 'object' ? source.services : {};
  const slots = Array.isArray(source.archive?.historySlotsReady)
    ? source.archive.historySlotsReady.map(item => cleanObserverString(item, 20)).filter(item => ['previous', 'dayAgo', 'weekAgo'].includes(item))
    : [];

  return {
    status: observerHealthState(source.status, 'pending'),
    summary: cleanObserverString(source.summary || 'Observer health data has not arrived yet.', 280),
    checkedAt: observerIso(source.checkedAt || source.checked_at),
    issues: Array.isArray(source.issues) ? source.issues.slice(0, 12).map(normalizeObserverHealthIssue) : [],
    capture: {
      ...captureBase,
      capturedAt: observerIso(source.capture?.capturedAt || source.capture?.captured_at),
      ageSeconds: Math.max(0, observerNumber(source.capture?.ageSeconds) || 0),
      timerActive: observerBoolean(source.capture?.timerActive),
      timerState: cleanObserverString(source.capture?.timerState || 'unknown', 40),
      latestImageExists: observerBoolean(source.capture?.latestImageExists)
    },
    publisher: {
      ...publisherBase,
      timerActive: observerBoolean(source.publisher?.timerActive),
      timerState: cleanObserverString(source.publisher?.timerState || 'unknown', 40),
      version: cleanObserverString(source.publisher?.version || '', 40)
    },
    storage: {
      ...storageBase,
      mounted: observerBoolean(source.storage?.mounted),
      exists: observerBoolean(source.storage?.exists),
      writable: observerBoolean(source.storage?.writable),
      totalBytes: Math.max(0, observerNumber(source.storage?.totalBytes) || 0),
      availableBytes: Math.max(0, observerNumber(source.storage?.availableBytes) || 0),
      usedPercent: Math.max(0, Math.min(100, observerNumber(source.storage?.usedPercent) || 0)),
      probeError: cleanObserverString(source.storage?.probeError || '', 180)
    },
    power: {
      ...powerBase,
      available: observerBoolean(source.power?.available),
      throttledHex: cleanObserverString(source.power?.throttledHex || '', 40),
      undervoltageNow: observerBoolean(source.power?.undervoltageNow),
      undervoltageOccurred: observerBoolean(source.power?.undervoltageOccurred),
      throttledNow: observerBoolean(source.power?.throttledNow),
      throttledOccurred: observerBoolean(source.power?.throttledOccurred)
    },
    archive: {
      ...archiveBase,
      captureCount: Math.max(0, Math.floor(observerNumber(source.archive?.captureCount) || 0)),
      oldestCaptureAt: observerIso(source.archive?.oldestCaptureAt),
      newestCaptureAt: observerIso(source.archive?.newestCaptureAt),
      historySlotsReady: [...new Set(slots)]
    },
    services: {
      captureTimerActive: observerBoolean(services.captureTimerActive),
      captureTimerState: cleanObserverString(services.captureTimerState || 'unknown', 40),
      publishTimerActive: observerBoolean(services.publishTimerActive),
      publishTimerState: cleanObserverString(services.publishTimerState || 'unknown', 40)
    }
  };
}

export function normalizeObserverStatus(input, overrides = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const capturedAt = observerIso(overrides.capturedAt || body.capturedAt || body.captured_at || body.capturedAtLocal || body.captured_at_local);
  const imageAvailable = overrides.imageAvailable === true || body.imageAvailable === true;
  const comparisons = normalizeObserverComparisons(overrides.comparisons || body.comparisons);
  const health = normalizeObserverHealth(overrides.health || body.health);

  return {
    schemaVersion: OBSERVER_SCHEMA_VERSION,
    configured: true,
    ok: overrides.ok ?? (body.ok !== false),
    receivedAt: new Date().toISOString(),
    publishedAt: observerIso(overrides.publishedAt || body.publishedAt) || new Date().toISOString(),
    capturedAt,
    cameraLabel: cleanObserverString(body.cameraLabel || body.camera?.label || 'Sump camera', 80),
    stream: cleanObserverString(body.stream || body.camera?.stream || 'stream2', 30),
    resolution: cleanObserverString(body.resolution || body.camera?.resolution || '1280×720', 40),
    captureIntervalMinutes: Math.max(1, Math.min(1440, observerNumber(body.captureIntervalMinutes || body.intervalMinutes) || 5)),
    publisherVersion: cleanObserverString(body.publisherVersion || health.publisher.version || '', 40),
    sizeBytes: Math.max(0, observerNumber(overrides.sizeBytes ?? body.sizeBytes ?? body.size_bytes) || 0),
    durationSeconds: Math.max(0, observerNumber(body.durationSeconds ?? body.duration_seconds) || 0),
    imageAvailable,
    imageVersion: cleanObserverString(overrides.imageVersion || body.imageVersion || capturedAt || '', 100),
    thumbnailUrl: imageAvailable ? OBSERVER_IMAGE_ROUTE : '',
    comparisons,
    health,
    storage: {
      label: cleanObserverString(body.storage?.label || body.storageLabel || 'Local Pi drive', 80),
      totalBytes: Math.max(0, observerNumber(body.storage?.totalBytes) || 0),
      availableBytes: Math.max(0, observerNumber(body.storage?.availableBytes) || 0),
      usedPercent: Math.max(0, Math.min(100, observerNumber(body.storage?.usedPercent) || 0))
    },
    message: cleanObserverString(body.message || body.error || '', 240)
  };
}

export function awaitingObserverStatus(message = 'The app-side Aquarium Observer is ready, but the Raspberry Pi publishing bridge has not uploaded a capture yet.') {
  return {
    schemaVersion: OBSERVER_SCHEMA_VERSION,
    configured: false,
    ok: false,
    state: 'awaiting_remote_bridge',
    captureIntervalMinutes: 5,
    cameraLabel: 'Sump camera',
    stream: 'stream2',
    resolution: '1280×720',
    imageAvailable: false,
    thumbnailUrl: '',
    comparisons: normalizeObserverComparisons({}),
    health: normalizeObserverHealth({}),
    storage: { label: 'Local Pi drive' },
    message: cleanObserverString(message, 240)
  };
}
