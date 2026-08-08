import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const html = fs.readFileSync('index.html', 'utf8');
const testCommand = pkg.scripts?.test || '';

assert.equal(pkg.version, '4.3.69');
assert.ok(html.includes('Reef Keeper v4.3.69 Maintenance 9M'));

for (const requiredTest of [
  'javascript-syntax.test.mjs',
  'global-function-integrity.test.mjs',
  'dom-reference-integrity.test.mjs',
  'mobile-ui-positioning.test.mjs',
  'index-layout-cleanup.test.mjs',
  'index-js-cleanup.test.mjs',
  'index-handler-render-cleanup.test.mjs',
  'index-data-snapshot-cleanup.test.mjs',
  'index-storage-helper-cleanup.test.mjs',
  'integration-core.test.mjs',
  'observer-filter-roll.test.py',
  'observer-9e1-followup.test.mjs',
  'filter-roll-status.test.mjs',
  'observer-9m-return-water-level-reliability.test.mjs',
  'repository-integrity.test.mjs',
  'vercel-function-count.test.mjs',
]) {
  assert.ok(testCommand.includes(requiredTest), `Stable test command must include ${requiredTest}.`);
}

for (const retiredMarker of [
  'reefkeeper-v4-3-38-restore-original-nav-layout',
  'reefkeeper-v4-3-39-nav-click-fix',
  'reefkeeper-v4-3-40-nonhome-scroll-fix',
  '__homeIntelWrapped',
  'const oldShowWorkspace = window.showWorkspace',
  'const oldShowPage = window.showPage',
]) {
  assert.ok(!html.includes(retiredMarker), `Retired patch marker returned: ${retiredMarker}`);
}

for (const requiredFile of [
  'MAINTENANCE_9E_1_RELEASE_MANIFEST.md',
  'MAINTENANCE_9E_1_TEST_REPORT.md',
  'checksums/maintenance-9E1.sha256',
  'MAINTENANCE_9E_RELEASE_MANIFEST.md',
  'MAINTENANCE_9E_TEST_REPORT.md',
  'checksums/maintenance-9E.sha256',
  'MAINTENANCE_6F_RELEASE_MANIFEST.md',
  'MAINTENANCE_6F_TEST_REPORT.md',
  'checksums/maintenance-6F.sha256',
]) {
  assert.ok(fs.existsSync(requiredFile), `Stable checkpoint file is missing: ${requiredFile}`);
}

console.log('Stable safeguards remain active in v4.3.69.');
