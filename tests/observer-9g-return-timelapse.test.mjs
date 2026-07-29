import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeObserverTimelapseFeed,
  OBSERVER_RETURN_TIMELAPSE_SLOTS
} from '../lib/observer-common.js';

const feed = normalizeObserverTimelapseFeed({
  ok: true,
  updatedAt: '2026-07-29T20:00:00Z',
  timelapses: {
    week: {
      available: true,
      generatedAt: '2026-07-29T20:00:00Z',
      startCapturedAt: '2026-07-22T20:00:00Z',
      endCapturedAt: '2026-07-29T20:00:00Z',
      frameCount: 166,
      durationSeconds: 13.8,
      sizeBytes: 900000
    }
  },
  cameras: {
    return: {
      timelapses: {
        week: {
          available: true,
          generatedAt: '2026-07-29T20:03:00Z',
          startCapturedAt: '2026-07-22T20:03:00Z',
          endCapturedAt: '2026-07-29T20:03:00Z',
          frameCount: 165,
          durationSeconds: 13.75,
          sizeBytes: 880000
        }
      }
    }
  }
});

assert.equal(OBSERVER_RETURN_TIMELAPSE_SLOTS.week, 'aquarium-observer/return-chamber/timelapse-week.mp4');
assert.equal(feed.timelapses.week.videoUrl, '/api/observer-image?media=timelapse&slot=week');
assert.equal(feed.cameras.return.timelapses.week.videoUrl, '/api/observer-image?media=timelapse&slot=week&camera=return');
assert.equal(feed.cameras.return.timelapses.week.available, true);
assert.equal(feed.cameras.return.timelapses.month.available, false);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const imageApi = fs.readFileSync(new URL('../api/observer-image.js', import.meta.url), 'utf8');
const publishApi = fs.readFileSync(new URL('../api/observer-publish.js', import.meta.url), 'utf8');
const r2 = fs.readFileSync(new URL('../lib/observer-r2.js', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../connector/timelapse-builder.py', import.meta.url), 'utf8');

assert.doesNotMatch(html, /id="observer-timelapse-disclosure" data-observer-overview-only/);
assert.match(observer, /Return chamber timelapses/);
assert.match(observer, /selectedTimelapseCameraFeed/);
assert.match(imageApi, /readObserverTimelapse\(timelapseSlot, timelapseCamera\)/);
assert.match(publishApi, /writeObserverTimelapse\(video, slot, cameraId\)/);
assert.match(r2, /OBSERVER_RETURN_TIMELAPSE_SLOTS/);
assert.match(builder, /RETURN_CAPTURES_DIR/);
assert.match(builder, /BUILDER_VERSION = '1\.2'/);
assert.match(builder, /derive_endpoint\(publish_endpoint, camera_id\)/);

console.log('Maintenance 9G return-chamber timelapse tests passed.');
