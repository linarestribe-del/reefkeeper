import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const retiredHelper of [
  'rkEquipmentDateLabel',
  'deleteEquipmentItem',
  'rkHomeScoreFromLog',
  'rkHomeOpenLatestPhoto',
  'rkHomeTelemetrySnapshot',
  'rkHomeRequestCloudTelemetry',
  'rkHomeTelemetryAge',
]) {
  assert.ok(
    !new RegExp(`function\\s+${retiredHelper}\\s*\\(`).test(html),
    `Unreachable inline helper remains: ${retiredHelper}`,
  );
}

assert.ok(!html.includes('__homeIntelWrapped'), 'Retired Home navigation wrappers must not return.');
assert.ok(!html.includes('const oldShowWorkspace = window.showWorkspace'), 'showWorkspace must not be wrapped by the Home renderer.');
assert.ok(!html.includes('const oldShowPage = window.showPage'), 'showPage must not be wrapped by the Home renderer.');
assert.ok(!html.includes('Forced Home intelligence render failed'), 'Duplicate forced window-load Home renderer must remain removed.');

const hookMatch = html.match(/\(function installHomeIntelligenceHooks\(\)\{([\s\S]*?)\}\)\(\);/);
assert.ok(hookMatch, 'Canonical Home intelligence hook is missing.');
const hook = hookMatch[1];

assert.match(hook, /window\.renderHomeIntelligence\s*=\s*renderHomeIntelligence;/, 'Home intelligence renderer must remain globally available.');
assert.match(hook, /window\.renderHomeTelemetry\s*=\s*renderHomeTelemetry;/, 'Home telemetry renderer must remain globally available.');
assert.match(hook, /DOMContentLoaded[\s\S]*\{\s*once:true\s*\}/, 'Initial Home render must use one DOM-ready listener.');
assert.ok(!hook.includes('renderHomeIntelligence(); renderHomeTelemetry();'), 'Initial hook must not request telemetry twice.');
assert.ok(!hook.includes("setTimeout(run, 80)"), 'Home navigation must rely on the canonical direct navigator render.');

const hookCount = (html.match(/installHomeIntelligenceHooks/g) || []).length;
assert.equal(hookCount, 1, 'Exactly one Home intelligence installation hook is required.');

console.log('Index JavaScript cleanup regression tests passed.');
