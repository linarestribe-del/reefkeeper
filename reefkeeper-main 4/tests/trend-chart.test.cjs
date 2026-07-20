const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('ai/trend-chart.js', 'utf8');
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(code, context);
const chart = context.globalThis.ReefKeeperTrendChart;

assert(chart, 'Trend chart module should export');
assert.equal(chart.version, '2B.0.0');

const model = chart.buildModel({
  paramKey: 'po4',
  width: 360,
  height: 224,
  target: [0.05, 0.10],
  points: [
    { time: Date.parse('2026-07-01T12:00:00Z'), value: 0.42 },
    { time: Date.parse('2026-07-02T12:00:00Z'), value: 0.39 },
    { time: Date.parse('2026-07-12T12:00:00Z'), value: 0.18 }
  ],
  events: [
    { title: 'Replaced GFO', time: Date.parse('2026-07-02T12:00:00Z') }
  ]
});

assert(model, 'Model should be created');
assert.equal(model.points.length, 3);
assert(model.targetBand, 'Working-range band should be present');
assert.equal(model.events.length, 1, 'Relevant event marker should be included');
assert(model.points[1].x - model.points[0].x < model.points[2].x - model.points[1].x, 'X spacing should reflect elapsed time rather than equal index spacing');
assert(model.valueTicks.length >= 3, 'Value axis should have readable grid ticks');
assert(model.dateTicks.length >= 2, 'Date axis should have labels');
assert.equal(model.nearestPointByX(model.points[1].x).index, 1, 'Touch inspection should choose the nearest point');

console.log('trend-chart tests passed');
