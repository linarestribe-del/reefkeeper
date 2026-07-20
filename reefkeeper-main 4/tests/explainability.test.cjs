const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('ai/explainability.js', 'utf8');
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);
const api = context.globalThis.ReefKeeperExplainability;

assert(api, 'Explainability module should export an API');
assert.equal(api.schemaVersion, '1.0');
assert.equal(api.build({ useTankContext: false }), null, 'General-chat responses should not get a tank evidence review');

const summary = api.build({
  useTankContext: true,
  evidenceContext: {
    evidence: [
      { claim: 'Manual alkalinity: 9.1 dKH', effectiveWeight: 0.91 },
      { claim: 'Live temperature: 77.8 °F', effectiveWeight: 0.88 },
      { claim: 'Older phosphate: 0.22 ppm', effectiveWeight: 0.31 }
    ],
    dataQuality: { issues: [] }
  },
  decisionReview: {
    confidence: { score: 78.4, label: 'moderate-high' },
    missingOrStaleData: [{ reason: 'The latest phosphate test is stale.' }],
    skepticReview: { concerns: ['A single reading does not establish a trend.'], counterEvidence: [] },
    decisionPolicy: { actionCeiling: 'small_reversible_step' }
  }
});

assert.equal(summary.confidence.score, 78);
assert.equal(summary.strongestEvidence[0], 'Manual alkalinity: 9.1 dKH');
assert(summary.missingOrStale.includes('The latest phosphate test is stale.'));
assert(summary.skepticNotes.includes('A single reading does not establish a trend.'));
assert.equal(summary.actionCeiling, 'small_reversible_step');
assert.match(summary.actionLabel, /small reversible step/i);

const fallback = api.build({ useTankContext: true, error: 'Evidence parsing failed' });
assert.equal(fallback.status, 'limited');
assert.equal(fallback.confidence.score, null);
assert(fallback.missingOrStale.includes('Evidence parsing failed'));
assert.equal(fallback.actionCeiling, 'observe_or_measure');

console.log('explainability tests passed');
