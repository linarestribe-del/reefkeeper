// Reef Keeper Build 2F — shared Aquarium Observer bridge validation

import { timingSafeEqual } from 'node:crypto';

export const OBSERVER_SCHEMA_VERSION = 2;
export const OBSERVER_STATUS_PATH = 'aquarium-observer/status.json';
export const OBSERVER_IMAGE_PATH = 'aquarium-observer/latest.jpg';
export const OBSERVER_IMAGE_ROUTE = '/api/observer-image';
export const MAX_OBSERVER_IMAGE_BYTES = 2 * 1024 * 1024;

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
  return process.env.REEF_OBSERVER_WRITE_TOKEN || process.env.REEF_TELEMETRY_WRITE_TOKEN || process.env.REEF_CONNECTOR_SECRET || '';
}

export function secureTokenMatch(provided, expected) {
  const left = Buffer.from(String(provided || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
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

export function normalizeObserverStatus(input, overrides = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const capturedAt = observerIso(body.capturedAt || body.captured_at || body.capturedAtLocal || body.captured_at_local);
  const imageAvailable = overrides.imageAvailable === true || body.imageAvailable === true;

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
    sizeBytes: Math.max(0, observerNumber(overrides.sizeBytes ?? body.sizeBytes ?? body.size_bytes) || 0),
    durationSeconds: Math.max(0, observerNumber(body.durationSeconds ?? body.duration_seconds) || 0),
    imageAvailable,
    imageVersion: cleanObserverString(overrides.imageVersion || body.imageVersion || capturedAt || '', 100),
    thumbnailUrl: imageAvailable ? OBSERVER_IMAGE_ROUTE : '',
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
    storage: { label: 'Local Pi drive' },
    message: cleanObserverString(message, 240)
  };
}
