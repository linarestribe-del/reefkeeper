import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../filter-roll-engine.js');
const engine = globalThis.ReefKeeperFilterRollEngine;

const priorCamera = {
  id:'camera-old', captureKey:'camera-old', measuredAt:'2026-08-06T22:00:00.000Z', measuredAtMs:Date.parse('2026-08-06T22:00:00.000Z'),
  remainingPercent:86, apparentOuterRadius:70.8, confidence:0.86, accepted:true, reason:'Camera reference from prior roll.', sourceType:'camera'
};
const priorRejected = {
  id:'camera-rejected-old', captureKey:'camera-rejected-old', measuredAt:'2026-08-13T21:55:00.000Z', measuredAtMs:Date.parse('2026-08-13T21:55:00.000Z'),
  remainingPercent:44, apparentOuterRadius:79.0, confidence:0.8, accepted:false, sourceType:'camera',
  reason:'Recent roll-edge readings disagreed by 4.8 px; maximum allowed deviation is 4.5 px.'
};
const newPhysical = {
  id:'physical-new-roll', captureKey:'physical-new-roll', measuredAt:'2026-08-14T13:49:00.000Z', measuredAtMs:Date.parse('2026-08-14T13:49:00.000Z'),
  remainingPercent:100, diameterMm:97, confidence:1, accepted:true,
  reason:'Physical roll diameter 97 mm; full 97 mm; core 46 mm.', sourceType:'manual'
};

const status = engine.buildStatus({
  config:{ currentDiameterMm:97, newRollDiameterMm:97, coreDiameterMm:46, partialCycle:false, partialCycleLabel:'Full cycle — replacement logged' },
  measurements:[priorCamera, priorRejected, newPhysical],
  nowMs:Date.parse('2026-08-14T13:52:00.000Z')
});

assert.equal(status.version, '9O');
assert.equal(status.current.source, 'physical diameter');
assert.equal(status.current.partialCycle, false);
assert.equal(status.current.percentRemaining, 100);
assert.equal(status.tracking.label, 'Physical estimate');
assert.equal(status.forecast.source, 'physical');
assert.equal(status.forecast.label, 'Learning this roll');
assert.ok(!/Holding last good reading|view blocked/i.test(status.forecast.label + ' ' + status.forecast.detail));
assert.ok(!status.warnings.join(' ').match(/stale|blocked|camera estimate/i), 'Old camera warnings should not drive new physical roll status.');

const html = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('filter-roll-status.js', 'utf8');
assert.match(html, /Reef Keeper v4\.3\.73 Maintenance 9O/);
assert.match(ui, /New cycle started — physical baseline/);
assert.match(ui, /prior-cycle camera readings are kept in diagnostics/);
assert.match(ui, /Current roll measurements only; older rejected camera diagnostics are collapsed once a newer camera reading is accepted/);

console.log('PASS observer-9n2-filter-roll-replacement-cycle');
