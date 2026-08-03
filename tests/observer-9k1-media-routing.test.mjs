import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeObserverStatus } from '../lib/observer-common.js';

const previousMediaBase = process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL;
try {
  process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL = 'https://observer.example.com';
  const normalized = normalizeObserverStatus({
    ok: true,
    capturedAt: '2026-08-03T23:20:54.000Z',
    publishedAt: '2026-08-03T23:25:28.000Z',
    imageAvailable: true,
    thumbnailUrl: '/api/observer-image',
    comparisons: {
      dayAgo: { available: true, capturedAt: '2026-08-02T23:20:54.000Z', imageUrl: '/api/observer-image?slot=dayAgo' }
    },
    cameras: {
      overview: { imageAvailable: true, capturedAt: '2026-08-03T23:20:54.000Z' },
      return: { imageAvailable: true, capturedAt: '2026-08-03T23:24:24.000Z' }
    }
  });
  assert.equal(normalized.thumbnailUrl, 'https://observer.example.com/aquarium-observer/latest.jpg');
  assert.equal(normalized.comparisons.dayAgo.imageUrl, 'https://observer.example.com/aquarium-observer/day-ago.jpg');
  assert.equal(normalized.cameras.overview.thumbnailUrl, 'https://observer.example.com/aquarium-observer/latest.jpg');
  assert.equal(normalized.cameras.return.thumbnailUrl, 'https://observer.example.com/aquarium-observer/return-chamber/latest.jpg');

  const statusApi = fs.readFileSync(new URL('../api/observer-status.js', import.meta.url), 'utf8');
  assert.match(statusApi, /normalizeObserverStatus\(record, \{/);
  assert.doesNotMatch(statusApi, /json\(record \|\| awaitingObserverStatus\(\)\)/);

  const worker = fs.readFileSync(new URL('../cloudflare/observer-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /withPublicMediaUrls\(status \|\|/);
  assert.match(worker, /ok:\s*true,[\s\S]*state:\s*'worker_storage_only'/);
} finally {
  if (previousMediaBase === undefined) delete process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL;
  else process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL = previousMediaBase;
}

console.log('Observer 9K.1 media routing tests passed.');
