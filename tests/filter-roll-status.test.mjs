import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../filter-roll-engine.js');
const engine = globalThis.ReefKeeperFilterRollEngine;
assert.ok(engine, 'Filter-roll engine must expose its browser API.');

const initialized = engine.calculateRemainingPercent(85, 100, 46);
assert.ok(Math.abs(initialized - 64.802130898) < 0.00001, '85/100/46 geometry must initialize at 64.8%.');

const manualAt = '2026-07-24T12:00:00Z';
const manual = {
  id: 'manual-1', captureKey: 'manual-1', measuredAt: manualAt, measuredAtMs: Date.parse(manualAt),
  remainingPercent: initialized, diameterMm: 85, confidence: 1, accepted: true,
  reason: 'Physical initialization', sourceType: 'manual'
};
const manualOnly = engine.buildStatus({
  config: {
    partialCycle: true,
    partialCycleLabel: 'Partial cycle — roll already in use',
    currentDiameterMm: 85,
    newRollDiameterMm: 100,
    coreDiameterMm: 46,
    cycleId: 'partial-1'
  },
  measurements: [manual],
  nowMs: Date.parse('2026-07-24T13:00:00Z')
});
assert.equal(manualOnly.current.source, 'manual initialization');
assert.equal(manualOnly.latestCameraMeasurement, null, 'Manual initialization must not be mislabeled as a camera measurement.');
assert.equal(manualOnly.forecast.available, false, 'One manual point must not create a replacement forecast.');
assert.match(manualOnly.current.partialCycleLabel, /Partial cycle/);

const cameraHistory = [0, 2, 4, 6, 8].map((day, index) => {
  const measuredAt = new Date(Date.UTC(2026, 6, 24 + day, 12, 0, 0)).toISOString();
  return {
    id: `capture-${index + 1}`,
    captureKey: `capture-${index + 1}`,
    measuredAt,
    measuredAtMs: Date.parse(measuredAt),
    remainingPercent: 64.8 - index * 1.7,
    diameterMm: engine.calculateDiameterFromRemainingPercent(64.8 - index * 1.7, 100, 46),
    confidence: 0.9,
    accepted: true,
    reason: '',
    sourceType: 'camera'
  };
});
const rejected = {
  ...cameraHistory[3], id: 'capture-rejected', captureKey: 'capture-rejected',
  measuredAt: '2026-07-31T12:00:00Z', measuredAtMs: Date.parse('2026-07-31T12:00:00Z'),
  remainingPercent: null, diameterMm: null, accepted: false, confidence: 0.2,
  reason: 'Outer silhouette inconsistent', apparentOuterRadius: 77.5
};
const status = engine.buildStatus({
  config: manualOnly.config,
  measurements: [manual, ...cameraHistory, rejected, { ...cameraHistory[4], confidence: 0.5 }],
  nowMs: Date.parse('2026-08-01T13:00:00Z')
});
assert.equal(status.measurements.filter(item => item.captureKey === 'capture-5').length, 1, 'Duplicate captures must count once.');
assert.equal(status.latestCameraMeasurement.captureKey, 'capture-5');
assert.ok(status.trend.pointCount >= 5, 'Accepted measurements must feed the usage trend.');
assert.equal(status.forecast.available, true, 'A multi-day reliable history should produce a provisional forecast.');
assert.ok(status.warnings.some(item => item.includes('rejected')), 'Excluded camera readings must remain disclosed.');

const html = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('filter-roll-status.js', 'utf8');
const css = fs.readFileSync('filter-roll-status.css', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.ok(html.includes('/filter-roll-engine.js?v=4.3.52'));
assert.ok(html.includes('/filter-roll-status.js?v=4.3.52'));
assert.ok(html.includes('/filter-roll-status.css?v=4.3.52'));
assert.ok(html.lastIndexOf('/filter-roll-status.js?v=4.3.52') < html.lastIndexOf('</body>'), '9D script must be linked from the real application body.');
assert.match(ui, /getFilterRollState/);
assert.match(ui, /reef_observer_filter_roll_state_v1/);
assert.match(ui, /latestCameraMeasurement/);
assert.match(css, /\.rk-filter-roll-card/);
for (const route of ['/filter-roll-engine.js', '/filter-roll-status.js', '/filter-roll-status.css']) {
  const index = vercel.routes.findIndex(item => item.src === route && item.dest === route);
  const fallback = vercel.routes.findIndex(item => item.src === '/(.*)');
  assert.ok(index >= 0 && index < fallback, `${route} must be served before the SPA fallback.`);
}
assert.equal(vercel.functions && Object.keys(vercel.functions).length, 3, 'Maintenance 9D must not add a Vercel function.');

console.log('Maintenance 9D filter-roll status tests passed.');
