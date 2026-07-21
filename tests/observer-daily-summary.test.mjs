import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  decodeObserverDailyImages,
  normalizeObserverDailySummary,
  normalizeObserverSlot,
  OBSERVER_IMAGE_SLOTS
} from '../lib/observer-common.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xd9]).toString('base64');
const images = decodeObserverDailyImages([
  { slot: 'dailyCurrent', capturedAt: '2026-07-21T19:00:00Z', imageBase64: jpeg },
  { slot: 'dailyPrevious', capturedAt: '2026-07-20T19:00:00Z', imageBase64: jpeg }
]);
assert.equal(images.length, 2);
assert.equal(images[0].slot, 'dailyPrevious');
assert.equal(normalizeObserverSlot('dailyCurrent'), 'dailyCurrent');
assert.equal(OBSERVER_IMAGE_SLOTS.dailyPrevious, 'aquarium-observer/daily-previous.jpg');
assert.throws(() => decodeObserverDailyImages([
  { slot: 'dailyCurrent', capturedAt: '2026-07-21T19:00:00Z', imageBase64: jpeg }
]), /requires both/);

const report = normalizeObserverDailySummary({
  ok: true,
  status: 'stable',
  generatedAt: '2026-07-21T19:22:00Z',
  headline: 'Sump view remains visually stable',
  summary: 'No meaningful concerning change is visible.',
  visibleChanges: ['Minor foam-height difference.'],
  concerns: [],
  nextChecks: ['Confirm skimmer cup level in person.'],
  uncertainty: 'Night vision reduces color information.',
  source: {
    previousCapturedAt: '2026-07-20T19:00:00Z',
    currentCapturedAt: '2026-07-21T19:00:00Z'
  }
});
assert.equal(report.ok, true);
assert.equal(report.status, 'stable');
assert.equal(report.source.currentImageUrl, '/api/observer-image?slot=dailyCurrent');
assert.equal(report.source.previousImageUrl, '/api/observer-image?slot=dailyPrevious');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/observer-daily-summary.js', import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL('../connector/observer-publisher.py', import.meta.url), 'utf8');
const blob = fs.readFileSync(new URL('../lib/observer-blob.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.match(html, /id="observer-daily-card"/);
assert.match(html, /id="observer-daily-compare-btn"/);
assert.match(observer, /fetchObserverDailySummary/);
assert.match(observer, /openDailySummaryComparison/);
assert.match(api, /decodeObserverDailyImages/);
assert.match(api, /Return JSON only/);
assert.match(api, /writeObserverDailySummary/);
assert.match(blob, /daily-summary\.json/);
assert.match(publisher, /def select_daily_images/);
assert.match(publisher, /daily_summary_hour_local/);
assert.match(publisher, /daily_summary_delay_minutes/);
assert.match(publisher, /DAILY_SUMMARY_RETRY/);
assert.equal(vercel.functions['api/observer-daily-summary.js'].maxDuration, 60);

console.log('Observer daily visual summary tests passed.');
