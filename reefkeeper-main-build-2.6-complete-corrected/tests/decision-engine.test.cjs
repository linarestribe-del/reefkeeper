const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const sandbox = { console, Date, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('ai/decision-engine.js', 'utf8'), sandbox);
const engine = sandbox.ReefKeeperDecisionEngine;
assert(engine, 'Decision engine did not initialize');

const now = Date.parse('2026-07-18T12:00:00Z');
function context(overrides = {}) {
  return {
    schemaVersion: '1.0',
    question: { text: 'Is my tank stable and safe?', topics: ['alk', 'po4'] },
    currentState: {
      temp: { timestamp: '2026-07-18T11:55:00Z' },
      sal: { timestamp: '2026-07-17T12:00:00Z' },
      alk: { timestamp: '2026-07-17T12:00:00Z' },
      po4: { timestamp: '2026-07-16T12:00:00Z' },
      no3: { timestamp: '2026-07-15T12:00:00Z' }
    },
    evidence: [
      { id:'e1', observationId:'o1', independenceGroup:'g1', effectiveWeight:.91, direction:'neutral' },
      { id:'e2', observationId:'o2', independenceGroup:'g2', effectiveWeight:.82, direction:'neutral' },
      { id:'e3', observationId:'o3', independenceGroup:'g3', effectiveWeight:.76, direction:'neutral' }
    ],
    conflicts: [],
    dataQuality: { issues: [] },
    ...overrides
  };
}

const strong = engine.evaluate(context(), { nowMs: now });
assert(strong.confidence.score >= 70, `Expected useful confidence, got ${strong.confidence.score}`);
assert.strictEqual(strong.missingOrStaleData.length, 0);
assert(['small_reversible_step','measured_action_with_monitoring'].includes(strong.decisionPolicy.actionCeiling));

const missing = context();
delete missing.currentState.alk;
missing.conflicts = [{ metric:'po4', summary:'Manual and live phosphate records conflict.' }];
const limited = engine.evaluate(missing, { nowMs: now });
assert(limited.missingOrStaleData.some(x => x.metric === 'alk'));
assert(limited.confidence.score < strong.confidence.score);
assert.notStrictEqual(limited.decisionPolicy.actionCeiling, 'measured_action_with_monitoring');
assert(limited.skepticReview.concerns.length > 0);

const stale = context({ question: { text:'Should I change alkalinity dosing?', topics:['dosing'] } });
stale.currentState.alk.timestamp = '2026-06-01T12:00:00Z';
const dosing = engine.evaluate(stale, { nowMs: now });
assert(dosing.missingOrStaleData.some(x => x.metric === 'alk' && x.status === 'stale'));
assert(['observe_or_measure','verify_then_small_reversible_step'].includes(dosing.decisionPolicy.actionCeiling));

const prompt = engine.toPromptBlock(dosing);
assert(prompt.includes('Do not raise the confidence score'));
assert(prompt.includes('actionCeiling'));

console.log('decision-engine tests passed');
