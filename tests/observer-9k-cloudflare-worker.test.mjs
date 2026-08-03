import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../cloudflare/observer-worker.js';

class MockR2Object {
  constructor(body, options = {}) {
    this.body = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
    this.size = this.body.byteLength;
    this.etag = `etag-${this.size}`;
    this.httpEtag = `"${this.etag}"`;
    this.httpMetadata = options.httpMetadata || {};
  }
  async json() { return JSON.parse(new TextDecoder().decode(this.body)); }
  writeHttpMetadata(headers) {
    if (this.httpMetadata.contentType) headers.set('Content-Type', this.httpMetadata.contentType);
  }
}

class MockR2Bucket {
  constructor() { this.objects = new Map(); }
  async put(key, value, options = {}) {
    this.objects.set(key, new MockR2Object(value, options));
    return { key };
  }
  async get(key) { return this.objects.get(key) || null; }
  async head(key) { return this.objects.get(key) || null; }
}

function b64(bytes) { return Buffer.from(bytes).toString('base64'); }
function request(path, { method = 'GET', body = null, token = 'secret' } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== null) headers.set('Content-Type', 'application/json');
  return new Request(`https://observer.example.com${path}`, { method, headers, body: body === null ? null : JSON.stringify(body) });
}

const env = { OBSERVER_BUCKET: new MockR2Bucket(), REEF_OBSERVER_WRITE_TOKEN: 'secret' };

let response = await worker.fetch(request('/health', { token: '' }), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).backend, 'cloudflare-worker-r2');

response = await worker.fetch(request('/api/observer-publish', {
  method: 'POST',
  body: {
    ok: true,
    capturedAt: '2026-08-03T20:00:00.000Z',
    imageBase64: b64(Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x01])),
    historyImages: [{ slot: 'previous', capturedAt: '2026-08-03T19:55:00.000Z', imageBase64: b64(Uint8Array.from([0xff, 0xd8, 0xff, 0x02])) }],
    health: { status: 'healthy', issues: [] }
  }
}), env);
assert.equal(response.status, 200);
const publish = await response.json();
assert.equal(publish.ok, true);
assert.equal(publish.cameraId, 'overview');
assert.equal(env.OBSERVER_BUCKET.objects.has('aquarium-observer/latest.jpg'), true);
assert.equal(env.OBSERVER_BUCKET.objects.has('aquarium-observer/previous.jpg'), true);

response = await worker.fetch(request('/api/observer-publish?camera=return', {
  method: 'POST',
  body: {
    ok: true,
    capturedAt: '2026-08-03T20:00:00.000Z',
    imageBase64: b64(Uint8Array.from([0xff, 0xd8, 0xff, 0x09])),
    health: { status: 'healthy', issues: [] }
  }
}), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).cameraId, 'return');
assert.equal(env.OBSERVER_BUCKET.objects.has('aquarium-observer/return-chamber/latest.jpg'), true);

response = await worker.fetch(request('/api/observer-status', { token: '' }), env);
assert.equal(response.status, 200);
const status = await response.json();
assert.equal(status.cameras.return.imageAvailable, true);

const mp4 = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
response = await worker.fetch(request('/api/observer-publish?resource=timelapse&camera=return', {
  method: 'POST',
  body: {
    slot: 'week',
    generatedAt: '2026-08-03T20:00:00.000Z',
    startCapturedAt: '2026-07-27T20:00:00.000Z',
    endCapturedAt: '2026-08-03T20:00:00.000Z',
    frameCount: 100,
    durationSeconds: 8.33,
    videoBase64: b64(mp4)
  }
}), env);
assert.equal(response.status, 200);
assert.equal(env.OBSERVER_BUCKET.objects.has('aquarium-observer/return-chamber/timelapse-week.mp4'), true);

response = await worker.fetch(request('/aquarium-observer/return-chamber/timelapse-week.mp4', { token: '' }), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get('Content-Type'), 'video/mp4');

response = await worker.fetch(request('/api/observer-publish', {
  method: 'POST',
  token: 'wrong',
  body: { imageBase64: b64(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])) }
}), env);
assert.equal(response.status, 401);

const configureScript = fs.readFileSync(new URL('../connector/configure-observer-worker-endpoint.sh', import.meta.url), 'utf8');
assert.match(configureScript, /cloudflare-worker-r2/);
assert.match(configureScript, /api\/observer-publish/);

console.log('Observer 9K Cloudflare Worker tests passed.');
