import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../ai/evidence-engine.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Date, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, RegExp, globalThis: {} });
context.window = {};
vm.runInContext(source, context, { filename: 'evidence-engine.js' });
const engine = context.window.ReefKeeperAIContext;
assert.ok(engine, 'Evidence engine should register on window');
assert.equal(engine.schemaVersion, '1.0');

const now = '2026-07-17T19:00:00.000Z';
const apexStatus = {
  ok: true,
  receivedAt: '2026-07-17T18:59:00.000Z',
  raw: {
    istat: {
      inputs: [
        { name: 'Tmp', value: 77.8 },
        { name: 'pH', value: 8.10 },
        { name: 'ORP', value: 342 },
        { name: 'Leak1', value: 0 }
      ],
      outputs: [
        { name: 'Heat1', status: ['OFF'] },
        { name: 'ATO', status: ['AUTO'] }
      ]
    }
  }
};

const result = engine.collectContext({
  now,
  question: 'Why is phosphate falling and is my pH safe?',
  apexStatus,
  logs: [
    { id: 'old', isoDate: '2026-06-01T12:00:00.000Z', po4: '0.30', ph: '8.34', alk: '9.2' },
    { id: 'latest', isoDate: '2026-07-16T12:00:00.000Z', po4: '0.18', ph: '8.31', alk: '9.1' }
  ],
  actions: [{ id: 'gfo', isoDate: '2026-07-10T12:00:00.000Z', title: 'Replaced GFO', category: 'Filtration' }],
  completedHistory: [],
  reminders: [],
  inventory: [{ id: 'tang', name: 'Yellow tang', type: 'fish', status: 'stable', createdAt: '2026-01-01T00:00:00.000Z' }],
  equipment: [{ id: 'apex', name: 'Neptune Apex', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }],
  knowledge: [{ id: 'rule', title: 'Stability first', note: 'Avoid rapid changes.', locked: true, createdAt: '2026-01-01T00:00:00.000Z' }],
  library: [
    { id: 'expert-current', title: 'Phosphate guidance', sourceClass: 'expert', status: 'current', reviewedAt: '2026-01-01T00:00:00.000Z', topics: ['po4'], text: 'Avoid abrupt nutrient changes.' },
    { id: 'old-superseded', title: 'Old phosphate method', sourceClass: 'community', status: 'superseded', reviewedAt: '2018-01-01T00:00:00.000Z', topics: ['po4'], text: 'Old method.' }
  ]
});

assert.equal(result.currentState.temp.value, 77.8, 'Fresh Apex temperature should be current');
assert.equal(result.currentState.po4.value, 0.18, 'Latest manual phosphate should be current');
assert.equal(result.currentState.po4.sourceId, 'latest');
assert.equal(result.currentState.ph.sourceId, 'apex_pH', 'Fresh Apex pH should outrank manual pH for current state');
assert.ok(result.conflicts.some(item => item.metric === 'ph'), 'Live/manual pH difference should remain explicit');
assert.ok(result.sources.some(item => item.id === 'expert-current'), 'Relevant current source should be selected');
assert.ok(!result.sources.some(item => item.id === 'old-superseded'), 'Superseded sources should be excluded from normal retrieval');
assert.ok(result.observations.some(item => item.kind === 'derived_trend' && item.metric === 'po4'), 'Parameter trends should be normalized');
assert.ok(result.evidence.every(item => item.effectiveWeight >= 0 && item.effectiveWeight <= 1), 'Weights should be bounded');

const prompt = engine.toPromptBlock(result);
assert.match(prompt, /STRUCTURED EVIDENCE CONTEXT/);
assert.match(prompt, /currentAuthoritativeState/);
assert.match(prompt, /measurement_difference/);

const stale = engine.collectContext({
  now,
  question: 'What is my current temperature?',
  apexStatus: { ...apexStatus, receivedAt: '2026-07-16T12:00:00.000Z' },
  logs: []
});
assert.equal(stale.currentState.temp.freshnessLabel, 'stale');
assert.ok(stale.dataQuality.issues.some(issue => /stale/i.test(issue)));

console.log('Evidence engine tests passed.');
