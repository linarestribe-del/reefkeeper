const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('ai/trend-engine.js', 'utf8');
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(code, context);
const engine = context.globalThis.ReefKeeperTrendEngine;

assert(engine, 'Trend Engine should export');
assert.equal(engine.version, '2A.0.0');

const phosphate = engine.analyze({
  paramKey: 'po4',
  points: [
    { isoDate: '2026-07-01T12:00:00Z', value: 0.42 },
    { isoDate: '2026-07-05T12:00:00Z', value: 0.34 },
    { isoDate: '2026-07-10T12:00:00Z', value: 0.25 },
    { isoDate: '2026-07-15T12:00:00Z', value: 0.16 }
  ],
  events: [
    { title: 'Replaced GFO', category: 'maintenance', isoDate: '2026-07-05T12:00:00Z' },
    { title: 'Cleaned skimmer cup', category: 'maintenance', isoDate: '2026-07-07T12:00:00Z' }
  ]
});
assert.equal(phosphate.trend, 'falling');
assert.equal(phosphate.status, 'above target');
assert(phosphate.slopePerDay < 0);
assert(phosphate.r2 > 0.9);
assert.equal(phosphate.events.length, 1, 'Only parameter-relevant events should be correlated');
assert(phosphate.interpretation.includes('moving in the desired direction'));

const stableAlk = engine.analyze({
  paramKey: 'alk',
  points: [
    { isoDate: '2026-07-01T12:00:00Z', value: 9.0 },
    { isoDate: '2026-07-05T12:00:00Z', value: 9.1 },
    { isoDate: '2026-07-10T12:00:00Z', value: 9.0 }
  ]
});
assert.equal(stableAlk.trend, 'stable');
assert.equal(stableAlk.status, 'within target');
assert(stableAlk.interpretation.includes('Hold the current course'));

const oscillatingAlk = engine.analyze({
  paramKey: 'alk',
  points: [8.2, 9.6, 8.3, 9.7, 8.4].map((value, index) => ({
    isoDate: `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
    value
  }))
});
assert.equal(oscillatingAlk.trend, 'oscillating');

const rapidAlk = engine.analyze({
  paramKey: 'alk',
  points: [
    { isoDate: '2026-07-01T12:00:00Z', value: 8.5 },
    { isoDate: '2026-07-02T12:00:00Z', value: 9.0 }
  ]
});
assert.equal(rapidAlk.rapidChange, true);
assert(rapidAlk.interpretation.includes('Verify the next reading'));

const insufficient = engine.analyze({ paramKey: 'mg', points: [{ isoDate: '2026-07-01', value: 1350 }] });
assert.equal(insufficient.trend, 'insufficient data');
assert.equal(insufficient.projection, null);

console.log('trend-engine tests passed');
