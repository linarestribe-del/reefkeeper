import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeObserverStatus } from '../lib/observer-common.js';
import { buildObserverOperationalAlerts } from '../api/observer-alerts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const observer = fs.readFileSync(path.join(root, 'observer.js'), 'utf8');
const publisher = fs.readFileSync(path.join(root, 'connector', 'observer-publisher.py'), 'utf8');
const calibrator = fs.readFileSync(path.join(root, 'connector', 'observer-water-level-calibrate.py'), 'utf8');
const installer = fs.readFileSync(path.join(root, 'connector', 'install-observer-publisher-2.8.1.sh'), 'utf8');
const rollCalibrator = fs.readFileSync(path.join(root, 'connector', 'observer-filter-roll-calibrate.py'), 'utf8');

const status = normalizeObserverStatus({
  ok: true,
  capturedAt: '2026-07-23T01:00:00Z',
  publishedAt: '2026-07-23T01:01:00Z',
  health: {
    status: 'attention',
    checkedAt: '2026-07-23T01:01:00Z',
    issues: [
      { code: 'camera_view_shifted', severity: 'warning', message: 'Camera framing moved.' },
      { code: 'water_level_urgent', severity: 'critical', message: 'Water level moved.' }
    ],
    localMonitoring: {
      status: 'attention',
      enabled: true,
      evaluatedAt: '2026-07-23T01:00:30Z',
      mode: 'normal',
      message: 'Local monitoring found a repeated visual condition.',
      imageQuality: { status: 'healthy', message: 'Image usable.', meanBrightness: 122, contrast: 37, edgeEnergy: 9 },
      scene: { status: 'attention', message: 'View shifted.', baselineReady: true, changeScore: 0.22, shiftX: 3, shiftY: 0, movementLikely: true, streak: 2 },
      waterLevel: { status: 'offline', message: 'Level changed.', configured: true, confidence: 0.84, baselineYPercent: 52, currentYPercent: 39, deltaPercent: 13, direction: 'higher', streak: 2 }
    }
  }
});

assert.equal(status.health.localMonitoring.status, 'attention');
assert.equal(status.health.localMonitoring.imageQuality.meanBrightness, 122);
assert.equal(status.health.localMonitoring.scene.movementLikely, true);
assert.equal(status.health.localMonitoring.scene.shiftX, 3);
assert.equal(status.health.localMonitoring.waterLevel.configured, true);
assert.equal(status.health.localMonitoring.waterLevel.deltaPercent, 13);

const alerts = buildObserverOperationalAlerts(status, new Date('2026-07-23T01:02:00Z'));
const shifted = alerts.find(alert => alert.issueCode === 'camera_view_shifted');
const water = alerts.find(alert => alert.issueCode === 'water_level_urgent');
assert.ok(shifted);
assert.equal(shifted.kind, 'system');
assert.equal(shifted.category, 'camera_quality');
assert.ok(water);
assert.equal(water.severity, 'urgent');
assert.equal(water.category, 'water_level');

for (const id of [
  'observer-health-disclosure',
  'observer-local-monitor-summary',
  'observer-local-monitor-badge',
  'observer-local-image-detail',
  'observer-local-scene-detail',
  'observer-local-water-detail'
]) {
  assert.ok(html.includes(`id="${id}"`), `Missing Observer local-monitor UI element ${id}`);
}
assert.match(observer, /function renderLocalMonitoring\(/);
assert.doesNotMatch(observer, /setHealthRow\('local'/, 'Local monitoring must not be rendered twice.');
assert.match(observer, /waterItem\.hidden = selectedCameraId !== 'return'/);
assert.match(observer, /Local visual monitoring/);
assert.match(publisher, /PUBLISHER_VERSION = '2\.8\.1'/);
assert.match(publisher, /def evaluate_local_monitor\(/);
assert.match(publisher, /def detect_water_line\(/);
assert.doesNotMatch(publisher, /openai|chatgpt/i, 'Per-frame publisher must not call AI');
assert.match(calibrator, /monitoring\.json/);
assert.match(calibrator, /baseline_y_percent/);
assert.match(installer, /systemctl.*ExecStart|--property=ExecStart/);
assert.match(installer, /PUBLISHER 2\.8\.1 ACTIVE/);
assert.match(rollCalibrator, /outer-edge-consensus-v2/);
assert.doesNotMatch(installer, /TARGET="\/usr\/local\/bin\/observer-publisher\.py"/);

console.log('Observer local monitor UI and alert tests passed.');
