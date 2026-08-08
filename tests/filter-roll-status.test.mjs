import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../filter-roll-engine.js');
const engine = globalThis.ReefKeeperFilterRollEngine;
assert.ok(engine, 'Filter-roll engine must expose its browser API.');

const remaining85 = engine.calculateRemainingPercent(85, 100, 46);
assert.ok(Math.abs(remaining85 - 64.802130898) < 0.00001, '85/100/46 geometry must initialize at 64.8%.');

const firstPhysical = {
  id:'physical-63', captureKey:'physical-63', measuredAt:'2026-08-06T07:19:00.000Z', measuredAtMs:Date.parse('2026-08-06T07:19:00.000Z'),
  remainingPercent:engine.calculateRemainingPercent(63, 100, 46), diameterMm:63,
  confidence:1, accepted:true, reason:'Physical roll diameter 63 mm; full 100 mm; core 46 mm.', sourceType:'manual'
};
const latestPhysical = {
  id:'physical-59', captureKey:'physical-59', measuredAt:'2026-08-08T06:19:00.000Z', measuredAtMs:Date.parse('2026-08-08T06:19:00.000Z'),
  remainingPercent:engine.calculateRemainingPercent(59, 100, 46), diameterMm:59,
  confidence:1, accepted:true, reason:'Physical roll diameter 59 mm; full 100 mm; core 46 mm.', sourceType:'manual'
};

assert.ok(Math.abs(firstPhysical.remainingPercent - 23.5032978) < 0.0001, '63 mm must calculate as 23.5% remaining.');
assert.ok(Math.abs(latestPhysical.remainingPercent - 17.3135464) < 0.0001, '59 mm must calculate as 17.3% remaining.');

const camera = {
  id:'camera-current', captureKey:'camera-current', measuredAt:'2026-08-08T05:58:00.000Z', measuredAtMs:Date.parse('2026-08-08T05:58:00.000Z'),
  remainingPercent:52.4, diameterMm:engine.calculateDiameterFromRemainingPercent(52.4, 100, 46),
  apparentOuterRadius:73, confidence:0.94, accepted:true, reason:'Camera reading', sourceType:'camera'
};

const status = engine.buildStatus({
  config:{
    partialCycle:true,
    partialCycleLabel:'Partial cycle — roll already in use',
    currentDiameterMm:85,
    newRollDiameterMm:100,
    coreDiameterMm:46,
    cycleId:'partial-existing-roll',
    scheduleHoursLocal:[9,15],
    minSpacingMinutes:240
  },
  measurements:[camera, firstPhysical, latestPhysical],
  nowMs:Date.parse('2026-08-08T06:35:00.000Z')
});

assert.equal(status.version, '9L.1');
assert.equal(status.current.source, 'physical diameter');
assert.ok(Math.abs(status.current.percentRemaining - latestPhysical.remainingPercent) < 0.0001, 'Latest physical measurement must control the current percent.');
assert.equal(Number(status.current.diameterMm.toFixed(1)), 59.0, 'Latest physical diameter must control the current diameter.');
assert.equal(status.physicalTrend.available, true, 'Two physical readings over time must create a physical usage rate.');
assert.ok(status.physicalTrend.ratePerDay > 3.0 && status.physicalTrend.ratePerDay < 3.3, 'Physical usage rate should be about 3.1 percent/day.');
assert.equal(status.trend.label, 'Physical recent');
assert.equal(status.forecast.source, 'physical');
assert.equal(status.forecast.label, 'Physical estimate');
assert.equal(status.forecast.available, true, 'Physical trend should produce a replacement window.');
assert.ok(status.forecast.dateRange.includes('Aug'), 'Replacement forecast should produce August dates.');

const html = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('filter-roll-status.js', 'utf8');
assert.ok(html.includes('/filter-roll-engine.js?v=4.3.71'));
assert.ok(html.includes('/filter-roll-status.js?v=4.3.71'));
assert.match(ui, /Log physical roll diameter/);
assert.match(ui, /logPhysicalFilterRollDiameterFromForm/);
assert.match(ui, /SEEDED_PHYSICAL_MEASUREMENTS/);
assert.match(ui, /2026-08-08T06:19:00.000Z/);
console.log('Maintenance 9L.1 filter-roll physical calibration tests passed.');
