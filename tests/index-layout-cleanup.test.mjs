import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

for (const retiredId of [
  'reefkeeper-v4-3-38-restore-original-nav-layout',
  'reefkeeper-v4-3-39-nav-click-fix',
  'reefkeeper-v4-3-40-nonhome-scroll-fix',
]) {
  assert.ok(!html.includes(retiredId), `Retired layout patch remains: ${retiredId}`);
}

assert.ok(
  !/\.tab-bar\s*,|\.bottom-tabs\s*,|\.nav-tabs\s*,|#bottom-nav\s*\{/.test(html),
  'Dead legacy navigation selectors must not return.',
);

const match = html.match(/<style id="reefkeeper-app-shell-navigation">([\s\S]*?)<\/style>/);
assert.ok(match, 'Canonical app-shell navigation style block is missing.');
const css = match[1];

assert.match(css, /\.app-content\s*\{[\s\S]*overflow-y:\s*scroll\s*!important;/, 'app-content must remain the scroll container.');
assert.match(css, /padding-bottom:\s*calc\(118px \+ env\(safe-area-inset-bottom\)\)\s*!important;/, 'app-content must preserve bottom-nav clearance.');
assert.match(css, /\.page\s*\{[\s\S]*padding-bottom:\s*calc\(112px \+ env\(safe-area-inset-bottom\)\)\s*!important;/, 'Home page clearance must be preserved.');
assert.match(css, /\.bottom-nav\s*\{[\s\S]*position:\s*fixed\s*!important;[\s\S]*z-index:\s*99999\s*!important;/, 'Bottom navigation must stay fixed and above content.');
assert.match(css, /\.bottom-nav \.nav-btn \*\s*\{[\s\S]*pointer-events:\s*auto\s*!important;/, 'Bottom navigation descendants must remain tappable.');
assert.match(css, /#page-settings\s*\{[\s\S]*overflow-y:\s*visible\s*!important;[\s\S]*padding-bottom:\s*28px\s*!important;/, 'Non-Home pages must continue growing inside app-content.');

const canonicalCount = (html.match(/id="reefkeeper-app-shell-navigation"/g) || []).length;
assert.equal(canonicalCount, 1, 'Exactly one canonical app-shell navigation block is required.');

console.log('Index layout cleanup regression tests passed.');
