// Reef Keeper Maintenance 9K — Cloudflare Worker Observer backend
// Deploy this Worker with an R2 bucket binding named OBSERVER_BUCKET and a
// secret named REEF_OBSERVER_WRITE_TOKEN. It accepts the same Pi publisher
// routes as the Vercel Observer API, but large image/video uploads and direct
// media reads bypass Vercel entirely.

const OBSERVER_STATUS_PATH = 'aquarium-observer/status.json';
const OBSERVER_DAILY_SUMMARY_PATH = 'aquarium-observer/daily-summary.json';
const OBSERVER_ALERTS_PATH = 'aquarium-observer/change-alerts.json';
const OBSERVER_TIMELAPSES_PATH = 'aquarium-observer/timelapses.json';

const IMAGE_SLOTS = Object.freeze({
  latest: 'aquarium-observer/latest.jpg',
  previous: 'aquarium-observer/previous.jpg',
  dayAgo: 'aquarium-observer/day-ago.jpg',
  weekAgo: 'aquarium-observer/week-ago.jpg',
  dailyCurrent: 'aquarium-observer/daily-current.jpg',
  dailyPrevious: 'aquarium-observer/daily-previous.jpg'
});
const RETURN_IMAGE_SLOTS = Object.freeze({ latest: 'aquarium-observer/return-chamber/latest.jpg' });
const TIMELAPSE_SLOTS = Object.freeze({
  week: 'aquarium-observer/timelapse-week.mp4',
  month: 'aquarium-observer/timelapse-month.mp4'
});
const RETURN_TIMELAPSE_SLOTS = Object.freeze({
  week: 'aquarium-observer/return-chamber/timelapse-week.mp4',
  month: 'aquarium-observer/return-chamber/timelapse-month.mp4'
});

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TIMELAPSE_BYTES = 2_800_000;

function corsHeaders(methods = 'GET,POST,OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Reef-Observer-Token',
    'X-Content-Type-Options': 'nosniff'
  };
}

function jsonResponse(value, status = 200, methods = 'GET,POST,OPTIONS') {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(methods),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}

function textResponse(value, status = 200) {
  return new Response(value, {
    status,
    headers: {
      ...corsHeaders('GET,OPTIONS'),
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}

function cleanString(value, max = 180) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function observerIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function observerNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readBearer(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(request.headers.get('X-Reef-Observer-Token') || '').trim();
}

function constantTimeMatch(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a.length || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function requireAuth(request, env) {
  const expected = String(env.REEF_OBSERVER_WRITE_TOKEN || '').trim();
  if (!expected) return { ok: false, response: jsonResponse({ ok: false, error: 'Worker missing REEF_OBSERVER_WRITE_TOKEN.' }, 500) };
  if (!constantTimeMatch(readBearer(request), expected)) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Unauthorized' }, 401) };
  }
  return { ok: true };
}

function requireBucket(env) {
  const bucket = env.OBSERVER_BUCKET;
  if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function') {
    throw new Error('Worker missing R2 binding OBSERVER_BUCKET.');
  }
  return bucket;
}

async function readJson(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json();
}

async function writeJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
  return value;
}

function decodeBase64(value, label) {
  let encoded = String(value || '').trim();
  const dataUrl = encoded.match(/^data:[^;]+;base64,(.*)$/is);
  if (dataUrl) encoded = dataUrl[1];
  encoded = encoded.replace(/\s+/g, '');
  if (!encoded) throw new Error(`Missing ${label}.`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error(`${label} is not valid Base64.`);
  }
  const binary = atob(encoded + '='.repeat((4 - (encoded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (!bytes.length) throw new Error(`Decoded ${label} is empty.`);
  return bytes;
}

function decodeJpeg(value) {
  const bytes = decodeBase64(value, 'imageBase64');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`Observer image exceeds the ${MAX_IMAGE_BYTES}-byte limit.`);
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('Observer upload must be a JPEG image.');
  }
  return bytes;
}

function decodeMp4(value) {
  const bytes = decodeBase64(value, 'videoBase64');
  if (bytes.byteLength > MAX_TIMELAPSE_BYTES) throw new Error(`Observer timelapse exceeds the ${MAX_TIMELAPSE_BYTES}-byte limit.`);
  if (bytes.byteLength < 12 || String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) !== 'ftyp') {
    throw new Error('Observer timelapse upload must be an MP4 file.');
  }
  return bytes;
}

function normalizeCameraId(value) {
  const camera = cleanString(value || 'overview', 20).toLowerCase();
  return camera === 'return' || camera === 'overview' ? camera : null;
}

function normalizeSlot(value) {
  const slot = cleanString(value || 'latest', 40);
  return Object.prototype.hasOwnProperty.call(IMAGE_SLOTS, slot) ? slot : null;
}

function normalizeTimelapseSlot(value) {
  const slot = cleanString(value || '', 20);
  return Object.prototype.hasOwnProperty.call(TIMELAPSE_SLOTS, slot) ? slot : null;
}

function imageKey(cameraId, slot = 'latest') {
  const camera = normalizeCameraId(cameraId);
  const normalizedSlot = normalizeSlot(slot);
  if (!camera || !normalizedSlot) return '';
  if (camera === 'return') return normalizedSlot === 'latest' ? RETURN_IMAGE_SLOTS.latest : '';
  return IMAGE_SLOTS[normalizedSlot];
}

function timelapseKey(cameraId, slot) {
  const camera = normalizeCameraId(cameraId) || 'overview';
  const normalizedSlot = normalizeTimelapseSlot(slot);
  if (!normalizedSlot) return '';
  const slots = camera === 'return' ? RETURN_TIMELAPSE_SLOTS : TIMELAPSE_SLOTS;
  return slots[normalizedSlot];
}

async function writeObject(bucket, key, bytes, contentType) {
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  const head = await bucket.head(key).catch(() => null);
  return { key, etag: head?.etag || new Date().toISOString(), size: bytes.byteLength, contentType };
}

function normalizeCameraStatus(cameraId, body, overrides = {}) {
  const capturedAt = observerIso(overrides.capturedAt || body.capturedAt || body.captured_at);
  const publishedAt = observerIso(overrides.publishedAt) || new Date().toISOString();
  return {
    cameraId,
    configured: true,
    ok: overrides.ok !== false,
    capturedAt,
    publishedAt,
    imageAvailable: overrides.imageAvailable === true,
    imageVersion: cleanString(overrides.imageVersion || capturedAt || publishedAt, 120),
    sizeBytes: Math.max(0, Math.floor(observerNumber(overrides.sizeBytes) || 0)),
    health: overrides.health || body.health || { status: 'pending', issues: [] },
    captureIntervalMinutes: Math.max(1, Math.floor(observerNumber(body.captureIntervalMinutes) || 5)),
    cameraLabel: cleanString(body.cameraLabel || (cameraId === 'return' ? 'Return chamber' : 'Sump overview'), 80),
    resolution: cleanString(body.resolution || '', 40)
  };
}

function mergeStatus(existing, update) {
  return {
    ...(existing || {}),
    ...update,
    schemaVersion: Math.max(10, Math.floor(observerNumber(update?.schemaVersion ?? existing?.schemaVersion) || 10)),
    configured: update?.configured !== false,
    receivedAt: new Date().toISOString(),
    cameras: {
      ...((existing && existing.cameras) || {}),
      ...((update && update.cameras) || {})
    }
  };
}

async function handlePublish(request, env, cameraId, resource) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const bucket = requireBucket(env);
  const body = await request.json();
  const camera = normalizeCameraId(cameraId || body.cameraId || 'overview');
  if (!camera) return jsonResponse({ ok: false, error: 'Unknown Observer camera.' }, 400);

  if (resource === 'timelapse') {
    const slot = normalizeTimelapseSlot(body.slot);
    const key = timelapseKey(camera, slot);
    if (!slot || !key) return jsonResponse({ ok: false, error: 'Timelapse slot must be week or month.' }, 400);
    const generatedAt = observerIso(body.generatedAt);
    const startCapturedAt = observerIso(body.startCapturedAt);
    const endCapturedAt = observerIso(body.endCapturedAt);
    if (!generatedAt || !startCapturedAt || !endCapturedAt) {
      return jsonResponse({ ok: false, error: 'Timelapse metadata requires generatedAt, startCapturedAt, and endCapturedAt.' }, 400);
    }
    const video = decodeMp4(body.videoBase64);
    const object = await writeObject(bucket, key, video, 'video/mp4');
    const existing = await readJson(bucket, OBSERVER_TIMELAPSES_PATH).catch(() => null) || {};
    const overviewTimelapses = {
      week: existing.cameras?.overview?.timelapses?.week || existing.timelapses?.week,
      month: existing.cameras?.overview?.timelapses?.month || existing.timelapses?.month
    };
    const returnTimelapses = {
      week: existing.cameras?.return?.timelapses?.week,
      month: existing.cameras?.return?.timelapses?.month
    };
    const record = {
      slot,
      cameraId: camera,
      available: true,
      state: 'ready',
      label: slot === 'month' ? 'Rolling 30 days' : 'Rolling 7 days',
      generatedAt,
      startCapturedAt,
      endCapturedAt,
      frameCount: Math.max(1, Math.floor(observerNumber(body.frameCount) || 1)),
      durationSeconds: Math.max(0.1, observerNumber(body.durationSeconds) || 0.1),
      sizeBytes: video.byteLength,
      coverageDays: Math.max(0, observerNumber(body.coverageDays) || 0),
      fps: Math.max(1, Math.min(60, observerNumber(body.fps) || 12)),
      resolution: cleanString(body.resolution || '640×360', 40),
      videoVersion: object.etag || generatedAt
    };
    (camera === 'return' ? returnTimelapses : overviewTimelapses)[slot] = record;
    await writeJson(bucket, OBSERVER_TIMELAPSES_PATH, {
      ok: true,
      updatedAt: new Date().toISOString(),
      timelapses: overviewTimelapses,
      cameras: {
        overview: { cameraId: 'overview', timelapses: overviewTimelapses },
        return: { cameraId: 'return', timelapses: returnTimelapses }
      }
    });
    return jsonResponse({ ok: true, durable: true, cameraId: camera, slot, generatedAt, sizeBytes: video.byteLength, updatedAt: new Date().toISOString() });
  }

  if (camera === 'return') {
    const image = decodeJpeg(body.imageBase64);
    const publishedAt = new Date().toISOString();
    const object = await writeObject(bucket, RETURN_IMAGE_SLOTS.latest, image, 'image/jpeg');
    const existing = await readJson(bucket, OBSERVER_STATUS_PATH).catch(() => null) || {};
    const cameraRecord = normalizeCameraStatus('return', body, {
      ok: body.ok !== false,
      capturedAt: body.capturedAt || body.captured_at,
      imageAvailable: true,
      imageVersion: body.capturedAt || body.captured_at || object.etag || publishedAt,
      publishedAt,
      sizeBytes: image.byteLength,
      health: body.health
    });
    const record = mergeStatus(existing, { cameras: { return: cameraRecord } });
    await writeJson(bucket, OBSERVER_STATUS_PATH, record);
    return jsonResponse({ ok: true, durable: true, cameraId: 'return', publishedAt, capturedAt: cameraRecord.capturedAt, sizeBytes: image.byteLength, healthStatus: cameraRecord.health?.status || 'pending' });
  }

  const image = decodeJpeg(body.imageBase64);
  const publishedAt = new Date().toISOString();
  const latestObject = await writeObject(bucket, IMAGE_SLOTS.latest, image, 'image/jpeg');
  const comparisons = {};
  const historyImages = Array.isArray(body.historyImages) ? body.historyImages.slice(0, 3) : [];
  for (const history of historyImages) {
    const slot = normalizeSlot(history?.slot);
    if (!['previous', 'dayAgo', 'weekAgo'].includes(slot)) continue;
    const capturedAt = observerIso(history?.capturedAt || history?.captured_at);
    if (!capturedAt) continue;
    const historyImage = decodeJpeg(history.imageBase64);
    const object = await writeObject(bucket, IMAGE_SLOTS[slot], historyImage, 'image/jpeg');
    comparisons[slot] = { available: true, capturedAt, sizeBytes: historyImage.byteLength, imageVersion: object.etag || capturedAt };
  }
  const existing = await readJson(bucket, OBSERVER_STATUS_PATH).catch(() => null) || {};
  const overviewRecord = {
    ...body,
    imageAvailable: true,
    imageVersion: body.capturedAt || body.captured_at || latestObject.etag || publishedAt,
    publishedAt,
    sizeBytes: image.byteLength,
    comparisons
  };
  const record = mergeStatus(existing, {
    ...body,
    ok: body.ok !== false,
    imageAvailable: true,
    imageVersion: overviewRecord.imageVersion,
    publishedAt,
    sizeBytes: image.byteLength,
    comparisons,
    cameras: { overview: overviewRecord }
  });
  await writeJson(bucket, OBSERVER_STATUS_PATH, record);
  return jsonResponse({ ok: true, durable: true, cameraId: 'overview', publishedAt, capturedAt: record.capturedAt || body.capturedAt || body.captured_at, sizeBytes: image.byteLength, historySlots: Object.keys(comparisons), healthStatus: record.health?.status || 'pending' });
}

async function handleStatus(request, env, cameraId) {
  const bucket = requireBucket(env);
  const url = new URL(request.url);
  if (url.searchParams.get('resource') === 'timelapses') {
    const feed = await readJson(bucket, OBSERVER_TIMELAPSES_PATH).catch(() => null);
    return jsonResponse(feed || {
      ok: true,
      updatedAt: null,
      timelapses: { week: { available: false, state: 'waiting_for_history' }, month: { available: false, state: 'waiting_for_history' } },
      cameras: { overview: { timelapses: {} }, return: { timelapses: {} } }
    });
  }
  if (request.method === 'POST') {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const camera = normalizeCameraId(cameraId || body.cameraId || 'overview');
    if (!camera) return jsonResponse({ ok: false, error: 'Unknown Observer camera.' }, 400);
    const existing = await readJson(bucket, OBSERVER_STATUS_PATH).catch(() => null) || {};
    const update = camera === 'return'
      ? { cameras: { return: normalizeCameraStatus('return', body, { ok: body.ok ?? existing.cameras?.return?.ok, health: body.health || existing.cameras?.return?.health, capturedAt: body.capturedAt || body.captured_at || existing.cameras?.return?.capturedAt, publishedAt: body.publishedAt || existing.cameras?.return?.publishedAt, imageAvailable: existing.cameras?.return?.imageAvailable === true, imageVersion: existing.cameras?.return?.imageVersion, sizeBytes: existing.cameras?.return?.sizeBytes }) } }
      : body;
    const record = mergeStatus(existing, update);
    await writeJson(bucket, OBSERVER_STATUS_PATH, record);
    return jsonResponse({ ok: true, durable: true, cameraId: camera, receivedAt: record.receivedAt });
  }
  const status = await readJson(bucket, OBSERVER_STATUS_PATH).catch(() => null);
  return jsonResponse(status || { ok: false, configured: true, message: 'Observer Worker is connected, but no status has been published yet.' });
}

async function handleImage(request, env, cameraId) {
  const bucket = requireBucket(env);
  const url = new URL(request.url);
  const media = url.searchParams.get('media');
  const slot = media === 'timelapse' ? normalizeTimelapseSlot(url.searchParams.get('slot') || 'week') : normalizeSlot(url.searchParams.get('slot') || 'latest');
  const camera = normalizeCameraId(cameraId || url.searchParams.get('camera') || 'overview') || 'overview';
  const key = media === 'timelapse' ? timelapseKey(camera, slot) : imageKey(camera, slot);
  if (!key) return jsonResponse({ ok: false, error: 'Unknown Observer media.' }, 404, 'GET,OPTIONS');
  return serveObject(bucket, key);
}

async function serveObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return jsonResponse({ ok: false, error: 'Object not found.' }, 404, 'GET,OPTIONS');
  const headers = new Headers(corsHeaders('GET,OPTIONS'));
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  if (!headers.get('Content-Type')) headers.set('Content-Type', key.endsWith('.mp4') ? 'video/mp4' : key.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/jpeg');
  return new Response(object.body, { status: 200, headers });
}

async function handleDailySummary(request, env) {
  const bucket = requireBucket(env);
  if (request.method === 'GET') {
    return jsonResponse(await readJson(bucket, OBSERVER_DAILY_SUMMARY_PATH).catch(() => null) || {
      ok: false,
      state: 'worker_storage_only',
      message: 'Daily AI summaries are paused on the direct Cloudflare Worker backend to reduce Vercel usage.'
    });
  }
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const record = {
    ok: false,
    state: 'worker_storage_only',
    generatedAt: new Date().toISOString(),
    message: 'Daily AI summaries are paused on the direct Cloudflare Worker backend to reduce Vercel usage.',
    source: {}
  };
  await writeJson(bucket, OBSERVER_DAILY_SUMMARY_PATH, record);
  return jsonResponse({ ...record, reused: true });
}

async function handleAlerts(request, env) {
  const bucket = requireBucket(env);
  if (request.method === 'POST') {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    await writeJson(bucket, OBSERVER_ALERTS_PATH, body);
    return jsonResponse({ ok: true, durable: true, updatedAt: new Date().toISOString() });
  }
  return jsonResponse(await readJson(bucket, OBSERVER_ALERTS_PATH).catch(() => null) || { ok: true, updatedAt: null, alerts: [], currentAlertIds: [] });
}

function routePath(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return clean.startsWith('/api/') ? clean.slice(4) : clean;
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
      const url = new URL(request.url);
      const path = routePath(url.pathname);
      const camera = normalizeCameraId(url.searchParams.get('camera') || 'overview');

      if (path === '/' || path === '/health') return jsonResponse({ ok: true, backend: 'cloudflare-worker-r2', checkedAt: new Date().toISOString() }, 200, 'GET,OPTIONS');
      if (path === '/observer-publish' && request.method === 'POST') return handlePublish(request, env, camera, url.searchParams.get('resource'));
      if (path === '/observer-status' && ['GET', 'POST'].includes(request.method)) return handleStatus(request, env, camera);
      if (path === '/observer-image' && request.method === 'GET') return handleImage(request, env, camera);
      if (path === '/observer-daily-summary' && ['GET', 'POST'].includes(request.method)) return handleDailySummary(request, env);
      if (path === '/observer-alerts' && ['GET', 'POST'].includes(request.method)) return handleAlerts(request, env);
      if (request.method === 'GET' && path.startsWith('/aquarium-observer/')) return serveObject(requireBucket(env), path.slice(1));
      return jsonResponse({ ok: false, error: 'Not found' }, 404);
    } catch (error) {
      return jsonResponse({ ok: false, error: cleanString(error?.message || 'Observer Worker error.', 240) }, 500);
    }
  }
};
