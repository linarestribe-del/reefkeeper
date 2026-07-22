import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');

const expectedTools = [
  'memory', 'memory',
  'inventory', 'inventory',
  'tankhistory', 'tankhistory',
  'familytree', 'familytree',
  'equipment', 'equipment',
  'strategy', 'strategy',
  'summary', 'summary',
  'knowledge', 'knowledge',
  'library', 'library',
  'report', 'report',
  'system', 'system'
];

const delegatedTools = [...html.matchAll(/data-scroll-tool="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(delegatedTools, expectedTools, 'Each tool-overlay title and top button must retain its scroll target.');
assert.equal((html.match(/onclick="scrollToolToTop\(/g) || []).length, 0, 'Retired duplicate inline tool scroll handlers must not return.');
assert.equal((html.match(/function installToolScrollDelegation\s*\(/g) || []).length, 1, 'One tool-scroll delegation installer is required.');
assert.ok(html.includes("event.target?.closest?.('[data-scroll-tool]')"), 'Delegated handler must resolve the clicked tool control.');
assert.ok(html.includes("typeof scrollToolToTop === 'function'"), 'Delegated handler must guard the shared scroll helper.');

assert.equal((html.match(/function rkHomeRenderSnapshot\s*\(/g) || []).length, 1, 'Home snapshot DOM rendering must have one implementation.');
assert.equal((html.match(/rkHomeRenderSnapshot\(snapshot\);/g) || []).length, 2, 'Both primary and fallback Home data paths must use the shared renderer.');
assert.equal((html.match(/renderHomeTelemetry\(\);/g) || []).length, 1, 'Home telemetry must be requested once by the shared renderer.');

const sharedStart = html.indexOf('function rkHomeRenderSnapshot(snapshot)');
const fallbackStart = html.indexOf('async function renderHomeIntelligenceFallback()', sharedStart);
const primaryStart = html.indexOf('function renderHomeIntelligence()', fallbackStart);
const hooksStart = html.indexOf('(function installHomeIntelligenceHooks()', primaryStart);
assert.ok(sharedStart >= 0 && fallbackStart > sharedStart && primaryStart > fallbackStart && hooksStart > primaryStart, 'Home renderer functions must remain in canonical order.');

const sharedBody = html.slice(sharedStart, fallbackStart);
const fallbackBody = html.slice(fallbackStart, primaryStart);
const primaryBody = html.slice(primaryStart, hooksStart);
for (const id of [
  'home-intel-score',
  'home-status-label',
  'home-status-value',
  'home-monitoring-value',
  'home-last-test-value',
  'home-intel-today',
  'home-intel-watching'
]) {
  assert.ok(sharedBody.includes(id), `Shared renderer must update ${id}.`);
  assert.ok(!fallbackBody.includes(id), `Fallback path must not duplicate ${id} rendering.`);
  assert.ok(!primaryBody.includes(id), `Primary path must not duplicate ${id} rendering.`);
}

console.log('Index handler and renderer cleanup regression tests passed.');
