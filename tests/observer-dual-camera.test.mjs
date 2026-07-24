import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeObserverStatus,
  normalizeObserverCameraId,
  observerCameraImageUrl
} from '../lib/observer-common.js';
import { buildObserverOperationalAlerts } from '../api/observer-alerts.js';

assert.equal(normalizeObserverCameraId('overview'), 'overview');
assert.equal(normalizeObserverCameraId('return'), 'return');
assert.equal(normalizeObserverCameraId('other'), null);
assert.equal(observerCameraImageUrl('overview', 'latest'), '/api/observer-image');
assert.equal(observerCameraImageUrl('return', 'latest'), '/api/observer-image?camera=return&slot=latest');
assert.equal(observerCameraImageUrl('return', 'dayAgo'), '');

const status = normalizeObserverStatus({
  ok: true,
  capturedAt: '2026-07-24T01:00:00Z',
  publishedAt: '2026-07-24T01:01:00Z',
  imageAvailable: true,
  cameraLabel: 'Sump overview',
  health: { status: 'healthy', checkedAt: '2026-07-24T01:01:00Z', issues: [] },
  cameras: {
    return: {
      configured: true,
      ok: true,
      capturedAt: '2026-07-24T01:00:30Z',
      publishedAt: '2026-07-24T01:01:05Z',
      imageAvailable: true,
      cameraLabel: 'Return chamber',
      stream: 'stream1',
      resolution: '2560×1440',
      health: {
        status: 'attention',
        checkedAt: '2026-07-24T01:01:05Z',
        issues: [{ code: 'water_level_watch', severity: 'warning', message: 'Return level shifted.' }],
        localMonitoring: {
          status: 'attention',
          waterLevel: { status: 'attention', configured: true, deltaPercent: 6, confidence: 0.8 }
        }
      }
    }
  }
}, { imageAvailable: true });

assert.equal(status.schemaVersion, 9);
assert.equal(status.cameras.overview.cameraId, 'overview');
assert.equal(status.cameras.return.cameraId, 'return');
assert.equal(status.cameras.return.cameraLabel, 'Return chamber');
assert.equal(status.cameras.return.thumbnailUrl, '/api/observer-image?camera=return&slot=latest');
assert.equal(status.cameras.return.health.localMonitoring.waterLevel.configured, true);

const alerts = buildObserverOperationalAlerts(status, new Date('2026-07-24T01:02:00Z'));
const returnAlert = alerts.find(alert => alert.issueCode === 'water_level_watch');
assert.ok(returnAlert, 'return-camera issue should be exposed as an operational alert');
assert.match(returnAlert.title, /^Return chamber:/);
assert.match(returnAlert.id, /:return:water_level_watch$/);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL('../connector/observer-publisher.py', import.meta.url), 'utf8');
const calibrator = fs.readFileSync(new URL('../connector/observer-water-level-calibrate.py', import.meta.url), 'utf8');
const publishApi = fs.readFileSync(new URL('../api/observer-publish.js', import.meta.url), 'utf8');
const imageApi = fs.readFileSync(new URL('../api/observer-image.js', import.meta.url), 'utf8');

for (const id of ['observer-camera-overview', 'observer-camera-return', 'observer-detail-eyebrow', 'observer-detail-title']) {
  assert.ok(html.includes(`id="${id}"`), `missing dual-camera UI element ${id}`);
}
assert.match(ui, /function selectObserverCamera\(/);
assert.match(ui, /selectedCameraId = 'overview'/);
assert.match(ui, /data-observer-overview-only/);
assert.match(publishApi, /cameraId === 'return'/);
assert.match(publishApi, /writeObserverCameraImage\(latestImage, 'return', 'latest'\)/);
assert.match(imageApi, /readObserverCameraImage\(cameraId, slot\)/);
assert.match(publisher, /PUBLISHER_VERSION = '2\.5'/);
assert.match(publisher, /RETURN_CAPTURE_STATUS_PATH/);
assert.match(publisher, /RETURN_CAPTURE_TIMER/);
assert.match(publisher, /publish_return_camera\(/);
assert.match(publisher, /endpoint_with_camera\(endpoint, 'return'\)/);
assert.doesNotMatch(publisher, /192\.168\./);
assert.match(calibrator, /default='return'/);
assert.match(calibrator, /RETURN_IMAGE_PATH/);

console.log('Observer dual-camera tests passed.');
