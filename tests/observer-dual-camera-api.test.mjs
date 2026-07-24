import assert from 'node:assert/strict';
import publishHandler from '../api/observer-publish.js';
import statusHandler from '../api/observer-status.js';

const previous = {
  endpoint: process.env.REEF_OBSERVER_R2_ENDPOINT,
  access: process.env.REEF_OBSERVER_R2_ACCESS_KEY_ID,
  secret: process.env.REEF_OBSERVER_R2_SECRET_ACCESS_KEY,
  bucket: process.env.REEF_OBSERVER_R2_BUCKET,
  token: process.env.REEF_OBSERVER_WRITE_TOKEN,
  fetch: globalThis.fetch
};
process.env.REEF_OBSERVER_R2_ENDPOINT = 'https://example-account.r2.cloudflarestorage.com';
process.env.REEF_OBSERVER_R2_ACCESS_KEY_ID = 'test-access-key';
process.env.REEF_OBSERVER_R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.REEF_OBSERVER_R2_BUCKET = 'reefkeeper-observer';
process.env.REEF_OBSERVER_WRITE_TOKEN = 'test-observer-token';

const objects = new Map();
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(String(url)).pathname.replace(/^\/reefkeeper-observer\//, '');
  if (options.method === 'PUT') {
    const value = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body || '');
    objects.set(path, { value, contentType: options.headers?.['Content-Type'] || options.headers?.['content-type'] || 'application/octet-stream' });
    return new Response('', { status: 200, headers: { ETag: `"etag-${objects.size}"` } });
  }
  if (options.method === 'GET') {
    const stored = objects.get(path);
    if (!stored) return new Response('', { status: 404 });
    return new Response(stored.value, { status: 200, headers: { 'Content-Type': stored.contentType, 'Content-Length': String(stored.value.length), ETag: '"read-etag"' } });
  }
  return new Response('', { status: 405 });
};

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    send(value) { this.payload = value; return this; },
    end(value) { this.payload = value; return this; }
  };
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0xff, 0xd9]).toString('base64');
const headers = { authorization: 'Bearer test-observer-token' };

try {
  let res = responseMock();
  await publishHandler({ method: 'POST', headers, query: {}, body: {
    cameraId: 'overview', ok: true, capturedAt: '2026-07-24T01:00:00Z', imageBase64: jpeg,
    cameraLabel: 'Sump overview', stream: 'stream1', resolution: '2560×1440',
    health: { status: 'healthy', issues: [] }, historyImages: []
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.ok(objects.has('aquarium-observer/latest.jpg'));

  res = responseMock();
  await publishHandler({ method: 'POST', headers, query: { camera: 'return' }, body: {
    cameraId: 'return', ok: true, capturedAt: '2026-07-24T01:00:30Z', imageBase64: jpeg,
    cameraLabel: 'Return chamber', stream: 'stream1', resolution: '2560×1440',
    health: { status: 'healthy', issues: [], localMonitoring: { status: 'healthy' } }
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.cameraId, 'return');
  assert.ok(objects.has('aquarium-observer/return-chamber/latest.jpg'));

  res = responseMock();
  await statusHandler({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.cameras.overview.cameraLabel, 'Sump overview');
  assert.equal(res.payload.cameras.return.cameraLabel, 'Return chamber');
  assert.equal(res.payload.cameras.overview.thumbnailUrl, '/api/observer-image');
  assert.equal(res.payload.cameras.return.thumbnailUrl, '/api/observer-image?camera=return&slot=latest');
  assert.equal(res.payload.cameras.return.capturedAt, '2026-07-24T01:00:30.000Z');
} finally {
  globalThis.fetch = previous.fetch;
  for (const [name, value] of [
    ['REEF_OBSERVER_R2_ENDPOINT', previous.endpoint],
    ['REEF_OBSERVER_R2_ACCESS_KEY_ID', previous.access],
    ['REEF_OBSERVER_R2_SECRET_ACCESS_KEY', previous.secret],
    ['REEF_OBSERVER_R2_BUCKET', previous.bucket],
    ['REEF_OBSERVER_WRITE_TOKEN', previous.token]
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

console.log('Observer dual-camera API tests passed.');
