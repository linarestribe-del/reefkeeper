import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeObserverHealth, normalizeObserverStatus, OBSERVER_SCHEMA_VERSION } from '../lib/observer-common.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL('../connector/observer-publisher.py', import.meta.url), 'utf8');
const statusApi = fs.readFileSync(new URL('../api/observer-status.js', import.meta.url), 'utf8');

assert.equal(OBSERVER_SCHEMA_VERSION, 10);
assert.match(html, /id="observer-health-badge"/);
assert.match(html, /id="observer-health-capture-row"/);
assert.match(html, /id="observer-health-publisher-row"/);
assert.match(html, /id="observer-health-storage-row"/);
assert.match(html, /id="observer-health-power-row"/);
assert.match(html, /id="observer-health-daily-row"/);
assert.doesNotMatch(html, /id="observer-health-local-row"/, 'Local monitoring must not be duplicated as a summary row and full section.');
assert.match(html, /id="observer-local-monitor-summary"/);
assert.match(html, /copyObserverDiagnosticReport\(\)/);
assert.match(observer, /PUBLISH_STALE_AFTER_MS/);
assert.match(observer, /The camera capture needs attention/);
assert.match(observer, /Reef Keeper Aquarium Observer diagnostic/);
assert.doesNotMatch(observer, /REEF_OBSERVER_WRITE_TOKEN|publisher\.json|Authorization: Bearer/);
assert.match(publisher, /PUBLISHER_VERSION = '2\.8\.0'/);
assert.match(publisher, /vcgencmd/);
assert.match(publisher, /os\.path\.ismount/);
assert.match(publisher, /systemctl', 'is-active'/);
assert.match(publisher, /HEALTH_REPORTED image unavailable/);
assert.match(statusApi, /const existing = await readObserverStatus/);
assert.match(statusApi, /imageAvailable: existing\?\.imageAvailable === true/);

const health = normalizeObserverHealth({
  status: 'attention',
  summary: 'Camera capture is stale.',
  checkedAt: '2026-07-21T05:30:00Z',
  issues: [{ code: 'capture_stale', severity: 'warning', message: 'Latest capture is 20 minutes old.' }],
  capture: { status: 'attention', message: 'Latest capture is stale.', timerActive: true, timerState: 'active' },
  publisher: { status: 'healthy', message: 'Publisher is active.', timerActive: true, timerState: 'active', version: '2.2' },
  storage: { status: 'healthy', mounted: true, writable: true, totalBytes: 1000, availableBytes: 800, usedPercent: 20 },
  power: { status: 'healthy', available: true, throttledHex: '0x0' },
  dailySummary: { status: 'attention', state: 'retry_scheduled', message: 'Retry scheduled.', framesReady: true, attemptCount: 1, maxAttempts: 3 },
  archive: { status: 'healthy', captureCount: 366, historySlotsReady: ['previous', 'dayAgo'] },
  services: { captureTimerActive: true, captureTimerState: 'active', publishTimerActive: true, publishTimerState: 'active' }
});
assert.equal(health.status, 'attention');
assert.equal(health.publisher.version, '2.2');
assert.equal(health.dailySummary.state, 'retry_scheduled');
assert.equal(health.dailySummary.attemptCount, 1);
assert.equal(health.storage.mounted, true);
assert.deepEqual(health.archive.historySlotsReady, ['previous', 'dayAgo']);
assert.equal(health.issues[0].severity, 'warning');

const record = normalizeObserverStatus({
  ok: true,
  capturedAt: '2026-07-21T05:25:00Z',
  publisherVersion: '2.2',
  health
}, { imageAvailable: true, sizeBytes: 150000 });
assert.equal(record.schemaVersion, 10);
assert.equal(record.publisherVersion, '2.2');
assert.equal(record.health.status, 'attention');
assert.equal(record.imageAvailable, true);

console.log('Observer health regression tests passed.');
