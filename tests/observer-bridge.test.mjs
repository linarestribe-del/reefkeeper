import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  decodeObserverJpeg,
  expectedObserverWriteToken,
  MAX_OBSERVER_IMAGE_BYTES,
  normalizeObserverStatus,
  secureTokenMatch,
  OBSERVER_IMAGE_ROUTE
} from '../lib/observer-common.js';


const previousObserverToken = process.env.REEF_OBSERVER_WRITE_TOKEN;
process.env.REEF_OBSERVER_WRITE_TOKEN = '  test-observer-token\n';
assert.equal(expectedObserverWriteToken(), 'test-observer-token', 'server token must ignore accidental surrounding whitespace');
assert.equal(secureTokenMatch('test-observer-token', '  test-observer-token\n'), true, 'token comparison must normalize surrounding whitespace');
if (previousObserverToken === undefined) delete process.env.REEF_OBSERVER_WRITE_TOKEN;
else process.env.REEF_OBSERVER_WRITE_TOKEN = previousObserverToken;

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xd9]);
assert.deepEqual(decodeObserverJpeg(jpeg.toString('base64')), jpeg, 'valid JPEG Base64 must decode');
assert.throws(
  () => decodeObserverJpeg(Buffer.from('not a jpeg').toString('base64')),
  /JPEG/,
  'non-JPEG data must be rejected'
);
assert.equal(MAX_OBSERVER_IMAGE_BYTES, 2 * 1024 * 1024, 'bridge must enforce a conservative image limit');

const record = normalizeObserverStatus({
  ok: true,
  captured_at: '2026-07-20T14:00:00-07:00',
  camera: { label: 'Sump camera', stream: 'stream2', host: '192.168.4.50' },
  rtspUrl: 'rtsp://secret@example.invalid/stream2',
  image: '/mnt/reef-ssd/private.jpg',
  storage: { label: 'Local Pi drive', totalBytes: 1000, availableBytes: 500, usedPercent: 50 }
}, {
  imageAvailable: true,
  sizeBytes: jpeg.length,
  imageVersion: 'capture-1'
});

assert.equal(record.thumbnailUrl, OBSERVER_IMAGE_ROUTE, 'status must expose only the same-origin image route');
assert.equal(record.sizeBytes, jpeg.length);
assert.equal(record.imageAvailable, true);
const serialized = JSON.stringify(record);
assert.doesNotMatch(serialized, /192\.168\./, 'status must not persist a home-network address');
assert.doesNotMatch(serialized, /rtsp:\/\//i, 'status must not persist an RTSP URL');
assert.doesNotMatch(serialized, /\/mnt\/reef-ssd/, 'status must not persist local file paths');

const publishApi = fs.readFileSync(new URL('../api/observer-publish.js', import.meta.url), 'utf8');
const imageApi = fs.readFileSync(new URL('../api/observer-image.js', import.meta.url), 'utf8');
const statusApi = fs.readFileSync(new URL('../api/observer-status.js', import.meta.url), 'utf8');
const blobStore = fs.readFileSync(new URL('../lib/observer-blob.js', import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL('../connector/observer-publisher.py', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(pkg.dependencies?.['@vercel/blob'] || '', /^\^?2\.[3-9]|^[3-9]/, 'private Blob support requires @vercel/blob >= 2.3');
assert.match(publishApi, /secureTokenMatch/, 'publisher endpoint must authenticate uploads');
assert.match(publishApi, /writeObserverImage\(latestImage, 'latest'\)/, 'publisher endpoint must write image bytes');
assert.match(blobStore, /access:\s*'private'/, 'Observer objects must use private Blob storage');
assert.match(blobStore, /allowOverwrite:\s*true/, 'latest objects must be replaceable at fixed paths');
assert.match(blobStore, /useCache:\s*false/, 'reads must not serve an older overwritten capture');
assert.match(imageApi, /Readable\.fromWeb/, 'private image route must stream the Blob response');
assert.match(imageApi, /private, no-store/, 'current image delivery must not be cached by the browser');
assert.match(statusApi, /Image bytes are accepted only by \/api\/observer-publish/, 'metadata route must reject image bytes');
assert.doesNotMatch(publisher, /192\.168\./, 'Pi publisher must not hard-code a private address');
assert.doesNotMatch(publisher, /rtsp:\/\//i, 'Pi publisher must never include an RTSP URL');

console.log('Aquarium Observer publishing bridge tests passed.');
