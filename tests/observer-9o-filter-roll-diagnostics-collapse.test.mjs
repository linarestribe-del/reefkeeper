import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../filter-roll-engine.js');
const engine = globalThis.ReefKeeperFilterRollEngine;
assert.ok(engine, 'Filter-roll engine must load.');

const physical = {
  id:'physical-new-roll', captureKey:'physical-new-roll', measuredAt:'2026-08-14T13:49:00.000Z', measuredAtMs:Date.parse('2026-08-14T13:49:00.000Z'),
  remainingPercent:100, diameterMm:97, confidence:1, accepted:true,
  reason:'Physical roll diameter 97 mm; full 97 mm; core 46 mm.', sourceType:'manual'
};
const rejectedBeforeAccepted = {
  id:'camera-rejected-after-replacement', captureKey:'camera-rejected-after-replacement', measuredAt:'2026-08-14T21:58:00.000Z', measuredAtMs:Date.parse('2026-08-14T21:58:00.000Z'),
  remainingPercent:63, apparentOuterRadius:46.5, confidence:0.63, accepted:false, sourceType:'camera',
  reason:'Detector confidence 63% was below the 65% acceptance threshold.; Large radius decrease (34%) would require confirmation before replacing the last accepted reading.'
};
const acceptedCamera = {
  id:'camera-used-after-roi-fix', captureKey:'camera-used-after-roi-fix', measuredAt:'2026-08-15T03:25:54.000Z', measuredAtMs:Date.parse('2026-08-15T03:25:54.000Z'),
  remainingPercent:97.3, apparentOuterRadius:70.0, confidence:0.85, accepted:true, sourceType:'camera',
  reason:'Filter-roll outer silhouette detected from multiple nearby scan lines.'
};

const status = engine.buildStatus({
  config:{ currentDiameterMm:97, newRollDiameterMm:97, coreDiameterMm:46, partialCycle:false, partialCycleLabel:'Full cycle — replacement logged' },
  measurements:[acceptedCamera, rejectedBeforeAccepted, physical],
  nowMs:Date.parse('2026-08-15T03:38:00.000Z')
});

assert.equal(status.version, '9O');
assert.equal(status.latestCameraMeasurement.id, 'camera-used-after-roi-fix');
assert.equal(status.latestRejectedCameraMeasurement.id, 'camera-rejected-after-replacement');

const ui = fs.readFileSync('filter-roll-status.js', 'utf8');
assert.match(ui, /Camera diagnostics \(\$\{archivedDiagnostics\.length\} older rejected reading/);
assert.match(ui, /supersededRejectedCamera/);
assert.match(ui, /older rejected camera attempts collapse after a newer camera reading is accepted/);

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /Reef Keeper v4\.3\.73 Maintenance 9O/);
assert.match(html, /filter-roll-status\.js\?v=4\.3\.73/);

console.log('PASS observer-9o-filter-roll-diagnostics-collapse');
