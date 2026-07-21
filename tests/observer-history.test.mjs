import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  decodeObserverHistoryImages,
  normalizeObserverComparisons,
  normalizeObserverSlot,
  OBSERVER_IMAGE_SLOTS
} from '../lib/observer-common.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xd9]).toString('base64');
const history = decodeObserverHistoryImages([
  { slot: 'previous', capturedAt: '2026-07-20T14:55:00Z', imageBase64: jpeg },
  { slot: 'dayAgo', capturedAt: '2026-07-19T15:00:00Z', imageBase64: jpeg }
]);
assert.equal(history.length, 2);
assert.equal(history[0].slot, 'previous');
assert.equal(normalizeObserverSlot('weekAgo'), 'weekAgo');
assert.equal(normalizeObserverSlot('unknown'), null);
assert.equal(OBSERVER_IMAGE_SLOTS.dayAgo, 'aquarium-observer/day-ago.jpg');

const comparisons = normalizeObserverComparisons({
  previous: { available: true, capturedAt: '2026-07-20T14:55:00Z', sizeBytes: 100 },
  weekAgo: { available: false }
});
assert.equal(comparisons.previous.available, true);
assert.equal(comparisons.previous.imageUrl, '/api/observer-image?slot=previous');
assert.equal(comparisons.weekAgo.imageUrl, '');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const publishApi = fs.readFileSync(new URL('../api/observer-publish.js', import.meta.url), 'utf8');
const imageApi = fs.readFileSync(new URL('../api/observer-image.js', import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL('../connector/observer-publisher.py', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.match(html, /id="observer-compare-previous"/);
assert.match(html, /id="observer-compare-dayAgo"/);
assert.match(html, /id="observer-compare-weekAgo"/);
assert.match(observer, /async function compareObserverHistory\(slot\)/);
assert.match(observer, /Image 1 was captured/);
assert.match(observer, /Do not call normal lighting differences a tank change/);
assert.match(publishApi, /decodeObserverHistoryImages/);
assert.match(publishApi, /historySlots/);
assert.match(imageApi, /req\.query\?\.slot/);
assert.match(publisher, /def select_history\(/);
assert.match(publisher, /timedelta\(days=7\)/);
assert.equal(vercel.functions['api/observer-publish.js'].maxDuration, 60);

console.log('Aquarium Observer history comparison tests passed.');
