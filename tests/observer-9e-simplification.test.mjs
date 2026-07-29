import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const observer = fs.readFileSync('observer.js', 'utf8');
const alertsApi = fs.readFileSync('api/observer-alerts.js', 'utf8');
const filterUi = fs.readFileSync('filter-roll-status.js', 'utf8');
const filterEngine = fs.readFileSync('filter-roll-engine.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');

assert.equal((html.match(/id="observer-filter-roll-status-mount"/g) || []).length, 1, '9E must have one filter-roll mount.');
assert.doesNotMatch(html, /id="observer-filter-roll-card"|Filter Roller Learning/, 'The legacy duplicate filter-roll card must be removed.');
assert.match(html, /id="observer-alert-history-disclosure"/);
assert.match(html, /id="observer-alert-history-list"/);
assert.match(html, /id="observer-health-disclosure"/);
assert.match(html, /id="observer-timelapse-disclosure"/);
assert.match(html, /id="observer-history-disclosure"/);
assert.doesNotMatch(html, /How Reef Keeper will use the camera/, 'Daily operational page must not retain the teaching card.');
assert.match(html, /Overall status/);
assert.match(html, /Technical details/);

assert.match(observer, /function alertReviewKey\(/);
assert.match(observer, /function isAlertReviewed\(/);
assert.match(observer, /function rememberReviewedAlerts\(/);
assert.match(observer, /ALERT_ACTIVE_KEY/);
assert.match(observer, /canReconcileLifecycle/);
assert.match(observer, /const active = scopedCurrentAlerts\.filter/);
assert.doesNotMatch(observer, /feed\.alerts\.slice\(0, 8\)/, 'Historical alerts must not dominate the active inbox.');
assert.match(observer, /reviewAll\.disabled = active\.length === 0/);
assert.match(observer, /waterItem\.hidden = selectedCameraId !== 'return'/);
assert.match(observer, /compactSummaryText/);
assert.match(alertsApi, /system:\$\{cameraId\}:\$\{issue\.code\}/, 'System alert identity must be stable across days.');

assert.match(filterUi, /hasQuantitativeValue/);
assert.match(observer, /schedulerOnly/);
assert.match(filterUi, /Physical entry/);
assert.match(filterUi, /Camera reference/);
assert.match(filterUi, /Manual baseline with camera reference established/);
assert.match(filterUi, /Measurements and setup/);
assert.match(filterUi, /Edit roll setup/);
assert.match(filterEngine, /nextExpectedMeasurementMs/);
assert.match(filterEngine, /too few independent camera measurements/);
assert.match(filterEngine, /needs-calibration/);
assert.match(css, /Maintenance 9E — compact Observer hierarchy/);
assert.match(css, /body:has\(#page-observer\.active\) \.scroll-top-btn/);

console.log('Maintenance 9E Observer simplification and alert lifecycle tests passed.');
