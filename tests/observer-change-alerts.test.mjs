import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeObserverAlertFeed,
  normalizeObserverChangeAlert
} from '../lib/observer-common.js';

const alert = normalizeObserverChangeAlert({
  severity: 'urgent',
  category: 'leak_overflow',
  title: 'Possible overflow evidence',
  evidence: 'A wet reflective area is newly visible below the skimmer.',
  recommendedCheck: 'Inspect the sump floor immediately.',
  confidence: 'Moderate; glare may contribute.',
  createdAt: '2026-07-21T20:00:00Z',
  source: {
    previousCapturedAt: '2026-07-20T19:00:00Z',
    currentCapturedAt: '2026-07-21T19:00:00Z'
  }
});
assert.equal(alert.severity, 'urgent');
assert.equal(alert.category, 'leak_overflow');
assert.equal(alert.source.currentCapturedAt, '2026-07-21T19:00:00.000Z');

const feed = normalizeObserverAlertFeed({
  ok: true,
  currentCapturedAt: '2026-07-21T19:00:00Z',
  currentAlertIds: [alert.id],
  alerts: [alert]
});
assert.equal(feed.alerts.length, 1);
assert.equal(feed.currentAlertIds.length, 1);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const dailyApi = fs.readFileSync(new URL('../api/observer-daily-summary.js', import.meta.url), 'utf8');
const alertsApi = fs.readFileSync(new URL('../api/observer-alerts.js', import.meta.url), 'utf8');
const blob = fs.readFileSync(new URL('../lib/observer-blob.js', import.meta.url), 'utf8');

assert.match(html, /id="observer-alert-card"/);
assert.match(html, /id="observer-alert-list"/);
assert.match(observer, /fetchObserverAlerts/);
assert.match(observer, /announceNewObserverAlerts/);
assert.match(observer, /markObserverAlertReviewed/);
assert.match(dailyApi, /Allowed categories: water_level, skimmer, leak_overflow/);
assert.match(dailyApi, /Use urgent only for clearly visible/);
assert.match(dailyApi, /saveAlertEvaluation/);
assert.match(alertsApi, /fallbackFeedFromDailySummary/);
assert.match(blob, /change-alerts\.json/);

console.log('Observer automatic change alert tests passed.');
