import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeObserverTimelapseFeed,
  observerCameraImageUrl
} from '../lib/observer-common.js';

const previousMediaBase = process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL;
const previousPublicBase = process.env.REEF_OBSERVER_PUBLIC_BASE_URL;

try {
  delete process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL;
  delete process.env.REEF_OBSERVER_PUBLIC_BASE_URL;

  assert.equal(observerCameraImageUrl('overview', 'latest'), '/api/observer-image');
  assert.equal(observerCameraImageUrl('overview', 'dayAgo'), '/api/observer-image?slot=dayAgo');
  assert.equal(observerCameraImageUrl('return', 'latest'), '/api/observer-image?camera=return&slot=latest');

  let feed = normalizeObserverTimelapseFeed({
    ok: true,
    updatedAt: '2026-08-03T12:00:00.000Z',
    timelapses: {
      week: {
        available: true,
        generatedAt: '2026-08-03T12:00:00.000Z',
        startCapturedAt: '2026-07-27T12:00:00.000Z',
        endCapturedAt: '2026-08-03T12:00:00.000Z'
      }
    },
    cameras: {
      return: {
        timelapses: {
          week: {
            available: true,
            generatedAt: '2026-08-03T12:00:00.000Z',
            startCapturedAt: '2026-07-27T12:00:00.000Z',
            endCapturedAt: '2026-08-03T12:00:00.000Z'
          }
        }
      }
    }
  });
  assert.equal(feed.timelapses.week.videoUrl, '/api/observer-image?media=timelapse&slot=week');
  assert.equal(feed.cameras.return.timelapses.week.videoUrl, '/api/observer-image?media=timelapse&slot=week&camera=return');

  process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL = 'https://observer-media.example.com/base/';
  assert.equal(observerCameraImageUrl('overview', 'latest'), 'https://observer-media.example.com/base/aquarium-observer/latest.jpg');
  assert.equal(observerCameraImageUrl('overview', 'weekAgo'), 'https://observer-media.example.com/base/aquarium-observer/week-ago.jpg');
  assert.equal(observerCameraImageUrl('return', 'latest'), 'https://observer-media.example.com/base/aquarium-observer/return-chamber/latest.jpg');

  feed = normalizeObserverTimelapseFeed({
    ok: true,
    updatedAt: '2026-08-03T12:00:00.000Z',
    timelapses: {
      week: {
        available: true,
        generatedAt: '2026-08-03T12:00:00.000Z',
        startCapturedAt: '2026-07-27T12:00:00.000Z',
        endCapturedAt: '2026-08-03T12:00:00.000Z'
      }
    },
    cameras: {
      return: {
        timelapses: {
          month: {
            available: true,
            generatedAt: '2026-08-03T12:00:00.000Z',
            startCapturedAt: '2026-07-04T12:00:00.000Z',
            endCapturedAt: '2026-08-03T12:00:00.000Z'
          }
        }
      }
    }
  });
  assert.equal(feed.timelapses.week.videoUrl, 'https://observer-media.example.com/base/aquarium-observer/timelapse-week.mp4');
  assert.equal(feed.cameras.return.timelapses.month.videoUrl, 'https://observer-media.example.com/base/aquarium-observer/return-chamber/timelapse-month.mp4');

  process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL = 'http://not-secure.example.com';
  assert.equal(observerCameraImageUrl('overview', 'latest'), '/api/observer-image');

  const functions = fs.readdirSync(new URL('../api', import.meta.url)).filter(name => name.endsWith('.js'));
  assert.equal(functions.length, 12, '9J must not add a Vercel Function while reducing media proxy pressure.');
} finally {
  if (previousMediaBase === undefined) delete process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL;
  else process.env.REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL = previousMediaBase;
  if (previousPublicBase === undefined) delete process.env.REEF_OBSERVER_PUBLIC_BASE_URL;
  else process.env.REEF_OBSERVER_PUBLIC_BASE_URL = previousPublicBase;
}

console.log('Observer 9J cost architecture tests passed.');
