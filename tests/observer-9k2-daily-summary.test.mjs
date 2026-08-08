import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../cloudflare/observer-worker.js';

class MockR2Object {
  constructor(body, options = {}) {
    this.body = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
    this.etag = `etag-${this.body.byteLength}`;
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
  async put(key, value, options = {}) { this.objects.set(key, new MockR2Object(value, options)); }
  async get(key) { return this.objects.get(key) || null; }
  async head(key) { return this.objects.get(key) || null; }
}

function request(path, { method = 'GET', body = null, token = 'secret' } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== null) headers.set('Content-Type', 'application/json');
  return new Request(`https://observer.example.com${path}`, { method, headers, body: body === null ? null : JSON.stringify(body) });
}

const env = { OBSERVER_BUCKET: new MockR2Bucket(), REEF_OBSERVER_WRITE_TOKEN: 'secret' };

let response = await worker.fetch(request('/api/observer-daily-summary', {
  method: 'POST',
  body: {
    dailyImages: [
      { slot: 'dailyPrevious', capturedAt: '2026-08-02T19:00:00.000Z' },
      { slot: 'dailyCurrent', capturedAt: '2026-08-03T19:00:00.000Z' }
    ]
  }
}), env);
assert.equal(response.status, 200);
const posted = await response.json();
assert.equal(posted.ok, true);
assert.equal(posted.reused, true);
assert.equal(posted.state, 'worker_storage_only');
assert.equal(posted.currentCapturedAt, '2026-08-03T19:00:00.000Z');

response = await worker.fetch(request('/api/observer-daily-summary', { token: '' }), env);
assert.equal(response.status, 200);
const stored = await response.json();
assert.equal(stored.ok, true);
assert.equal(stored.reused, true);
assert.equal(stored.source.dailyImageCount, 2);

const publisher = fs.readFileSync(new URL('../connector/observer-publisher.py', import.meta.url), 'utf8');
assert.match(publisher, /PUBLISHER_VERSION = '2\.8\.3'/);
assert.match(publisher, /def post_daily_summary_json/);
assert.match(publisher, /Daily summary acknowledged by storage-only Observer backend/);
assert.match(publisher, /daily_previous_for_decision/);

console.log('Observer 9K.2 daily-summary cleanup tests passed.');
