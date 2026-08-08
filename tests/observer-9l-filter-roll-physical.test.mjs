import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../filter-roll-engine.js');
const engine = globalThis.ReefKeeperFilterRollEngine;

const pct63 = engine.calculateRemainingPercent(63, 100, 46);
const pct59 = engine.calculateRemainingPercent(59, 100, 46);
const elapsedDays = (Date.parse('2026-08-08T06:19:00.000Z') - Date.parse('2026-08-06T07:19:00.000Z')) / 86400000;
const rate = (pct63 - pct59) / elapsedDays;
assert.ok(Math.abs(elapsedDays - 1.9583333333) < 0.00001);
assert.ok(rate > 3.0 && rate < 3.3, 'Recent physical usage rate should be about 3.1 percent/day.');

const ui = fs.readFileSync('filter-roll-status.js', 'utf8');
assert.match(ui, /Latest physical measurement/);
assert.match(ui, /Physical calibration/);
assert.match(ui, /This overrides the current percent and narrows the forecast/);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(pkg.version, '4.3.68');
assert.match(pkg.scripts.test, /observer-9l-filter-roll-physical\.test\.mjs/);
console.log('Maintenance 9L.1 physical roll measurement UI test passed.');
