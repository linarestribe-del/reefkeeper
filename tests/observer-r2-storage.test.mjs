import assert from 'node:assert/strict';
import {
  readObserverImage,
  readObserverStatus,
  writeObserverImage,
  writeObserverStatus
} from '../lib/observer-r2.js';

const previous = {
  endpoint: process.env.REEF_OBSERVER_R2_ENDPOINT,
  access: process.env.REEF_OBSERVER_R2_ACCESS_KEY_ID,
  secret: process.env.REEF_OBSERVER_R2_SECRET_ACCESS_KEY,
  bucket: process.env.REEF_OBSERVER_R2_BUCKET,
  fetch: globalThis.fetch
};

process.env.REEF_OBSERVER_R2_ENDPOINT = 'https://example-account.r2.cloudflarestorage.com';
process.env.REEF_OBSERVER_R2_ACCESS_KEY_ID = 'test-access-key';
process.env.REEF_OBSERVER_R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.REEF_OBSERVER_R2_BUCKET = 'reefkeeper-observer';

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  if (options.method === 'GET') {
    if (String(url).endsWith('/reefkeeper-observer/aquarium-observer/status.json')) {
      return new Response(JSON.stringify({ ok: true, storage: 'r2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"status-etag"' }
      });
    }
    if (String(url).endsWith('/reefkeeper-observer/aquarium-observer/latest.jpg')) {
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '4', ETag: '"image-etag"' }
      });
    }
    return new Response('', { status: 404 });
  }
  return new Response('', { status: 200, headers: { ETag: '"put-etag"' } });
};

try {
  const statusWrite = await writeObserverStatus({ ok: true });
  assert.equal(statusWrite.etag, 'put-etag');
  const imageWrite = await writeObserverImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'latest');
  assert.equal(imageWrite.etag, 'put-etag');

  const putRequests = requests.filter(item => item.options.method === 'PUT');
  assert.equal(putRequests.length, 2);
  for (const request of putRequests) {
    assert.match(request.url, /^https:\/\/example-account\.r2\.cloudflarestorage\.com\/reefkeeper-observer\/aquarium-observer\//);
    assert.match(String(request.options.headers.Authorization || ''), /^AWS4-HMAC-SHA256 Credential=test-access-key\//);
    assert.match(String(request.options.headers['x-amz-date'] || ''), /^\d{8}T\d{6}Z$/);
    assert.match(String(request.options.headers['x-amz-content-sha256'] || ''), /^[a-f0-9]{64}$/);
  }

  const status = await readObserverStatus();
  assert.deepEqual(status, { ok: true, storage: 'r2' });
  const image = await readObserverImage('latest');
  assert.equal(image.statusCode, 200);
  assert.equal(image.blob.contentType, 'image/jpeg');
  assert.equal(image.blob.size, 4);
  assert.equal(image.blob.etag, 'image-etag');
  assert.ok(image.stream && typeof image.stream.getReader === 'function');

  const getRequests = requests.filter(item => item.options.method === 'GET');
  assert.equal(getRequests.length, 2);
  for (const request of getRequests) {
    assert.match(String(request.options.headers.Authorization || ''), /^AWS4-HMAC-SHA256 Credential=test-access-key\//);
    assert.equal(request.options.redirect, 'error');
  }
} finally {
  globalThis.fetch = previous.fetch;
  for (const [name, value] of [
    ['REEF_OBSERVER_R2_ENDPOINT', previous.endpoint],
    ['REEF_OBSERVER_R2_ACCESS_KEY_ID', previous.access],
    ['REEF_OBSERVER_R2_SECRET_ACCESS_KEY', previous.secret],
    ['REEF_OBSERVER_R2_BUCKET', previous.bucket]
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

console.log('Cloudflare R2 Observer storage tests passed.');
