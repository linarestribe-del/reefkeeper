import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  decodeObserverMp4,
  normalizeObserverTimelapseFeed,
  normalizeObserverTimelapseSlot,
  OBSERVER_TIMELAPSE_SLOTS
} from '../lib/observer-common.js';

const minimalMp4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from('isomiso2')
]);
const decoded = decodeObserverMp4(minimalMp4.toString('base64'));
assert.equal(decoded.subarray(4, 8).toString('ascii'), 'ftyp');
assert.equal(normalizeObserverTimelapseSlot('week'), 'week');
assert.equal(normalizeObserverTimelapseSlot('bad'), null);
assert.equal(OBSERVER_TIMELAPSE_SLOTS.month, 'aquarium-observer/timelapse-month.mp4');
assert.throws(() => decodeObserverMp4(Buffer.from('not-mp4').toString('base64')), /MP4/);

const feed = normalizeObserverTimelapseFeed({
  ok: true,
  updatedAt: '2026-07-21T20:00:00Z',
  timelapses: {
    week: {
      available: true,
      generatedAt: '2026-07-21T20:00:00Z',
      startCapturedAt: '2026-07-14T20:00:00Z',
      endCapturedAt: '2026-07-21T20:00:00Z',
      frameCount: 160,
      durationSeconds: 13.3,
      sizeBytes: 1200000
    }
  }
});
assert.equal(feed.timelapses.week.available, true);
assert.equal(feed.timelapses.week.videoUrl, '/api/observer-image?media=timelapse&slot=week');
assert.equal(feed.timelapses.month.available, false);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const metadataApi = fs.readFileSync(new URL('../api/observer-status.js', import.meta.url), 'utf8');
const publishApi = fs.readFileSync(new URL('../api/observer-publish.js', import.meta.url), 'utf8');
const videoApi = fs.readFileSync(new URL('../api/observer-image.js', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../connector/timelapse-builder.py', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../connector/reefkeeper-observer-timelapse.service', import.meta.url), 'utf8');
const timer = fs.readFileSync(new URL('../connector/reefkeeper-observer-timelapse.timer', import.meta.url), 'utf8');
const blob = fs.readFileSync(new URL('../lib/observer-blob.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.match(html, /id="observer-timelapse-card"/);
assert.match(html, /id="observer-timelapse-week-video"/);
assert.match(html, /id="observer-timelapse-month-video"/);
assert.match(observer, /fetchObserverTimelapses/);
assert.match(observer, /playObserverTimelapse/);
assert.match(metadataApi, /readObserverTimelapseFeed/);
assert.match(publishApi, /decodeObserverMp4/);
assert.match(publishApi, /writeObserverTimelapseFeed/);
assert.match(videoApi, /Content-Range/);
assert.match(blob, /OBSERVER_TIMELAPSE_SLOTS/);
assert.match(builder, /def generate_timelapse/);
assert.match(builder, /def process_slot/);
assert.match(builder, /libx264/);
assert.match(builder, /MAX_TIMELAPSE_BYTES = 2_800_000/);
assert.match(service, /TimeoutStartSec=20min/);
assert.match(timer, /OnCalendar=\*-\*-\* 13:10:00/);
assert.equal(vercel.functions['api/observer-publish.js'].maxDuration, 60);
const functionCount = fs.readdirSync(new URL('../api/', import.meta.url)).filter(name => name.endsWith('.js')).length;
assert.equal(functionCount, 12, 'Hobby deployment must stay at or below 12 Vercel Functions');

console.log('Observer weekly/monthly timelapse tests passed.');
