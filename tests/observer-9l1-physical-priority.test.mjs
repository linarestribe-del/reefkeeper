import assert from 'node:assert/strict';

await import('../filter-roll-engine.js');
const engine = globalThis.ReefKeeperFilterRollEngine;

const physical63 = {
  id:'physical-63', captureKey:'physical-63', measuredAt:'2026-08-06T07:19:00.000Z', measuredAtMs:Date.parse('2026-08-06T07:19:00.000Z'),
  remainingPercent:engine.calculateRemainingPercent(63, 100, 46), diameterMm:63, confidence:1, accepted:true,
  reason:'Physical roll diameter 63 mm; full 100 mm; core 46 mm.', sourceType:'manual'
};
const physical59 = {
  id:'physical-59', captureKey:'physical-59', measuredAt:'2026-08-08T06:19:00.000Z', measuredAtMs:Date.parse('2026-08-08T06:19:00.000Z'),
  remainingPercent:engine.calculateRemainingPercent(59, 100, 46), diameterMm:59, confidence:1, accepted:true,
  reason:'Physical roll diameter 59 mm; full 100 mm; core 46 mm.', sourceType:'manual'
};
const acceptedCamera = {
  id:'camera-used', captureKey:'camera-used', measuredAt:'2026-08-06T22:00:00.000Z', measuredAtMs:Date.parse('2026-08-06T22:00:00.000Z'),
  remainingPercent:47.6, apparentOuterRadius:70.8, confidence:0.86, accepted:true, reason:'Camera reading', sourceType:'camera'
};
const rejectedCamera = {
  id:'camera-rejected', captureKey:'camera-rejected', measuredAt:'2026-08-07T21:55:00.000Z', measuredAtMs:Date.parse('2026-08-07T21:55:00.000Z'),
  remainingPercent:85, apparentOuterRadius:64.5, confidence:0.85, accepted:false, sourceType:'camera',
  reason:'Large radius decrease (9%) requires confirmation in a later scheduled window.'
};

const status = engine.buildStatus({
  config:{ currentDiameterMm:85, newRollDiameterMm:100, coreDiameterMm:46, partialCycle:true },
  measurements:[physical63, acceptedCamera, rejectedCamera, physical59],
  nowMs:Date.parse('2026-08-08T06:55:00.000Z')
});

assert.equal(status.version, '9L.1');
assert.equal(status.current.source, 'physical diameter');
assert.equal(status.tracking.state, 'physical');
assert.equal(status.tracking.label, 'Physical estimate');
assert.ok(!/blocked/i.test(status.tracking.label), 'Physical estimate should not be labeled blocked.');
assert.equal(status.forecast.source, 'physical');
assert.ok(Math.abs(status.current.percentRemaining - physical59.remainingPercent) < 0.001);

console.log('Maintenance 9L.1 physical priority cleanup test passed.');
