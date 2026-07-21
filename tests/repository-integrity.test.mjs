import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

for (const required of [
  'package-lock.json',
  '.nvmrc',
  '.gitignore',
  'ROLLBACK.md',
  'RELEASE_MANIFEST.md',
  'checksums/runtime-critical.sha256',
  '.github/workflows/ci.yml'
]) {
  assert.ok(fs.existsSync(path.join(root, required)), `Missing repository safeguard: ${required}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.engines?.node, '22.x', 'package.json must pin Node.js 22.x.');
assert.match(String(packageJson.packageManager || ''), /^npm@10\./, 'package.json must pin npm 10.x.');

const forbiddenNames = new Set(['__MACOSX', '__pycache__', '.DS_Store']);
function scanForbidden(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    assert.ok(!forbiddenNames.has(entry.name), `Forbidden repository artifact found: ${path.relative(root, path.join(directory, entry.name))}`);
    assert.ok(!entry.name.endsWith('.pyc'), `Compiled Python cache found: ${path.relative(root, path.join(directory, entry.name))}`);
    if (entry.isDirectory()) scanForbidden(path.join(directory, entry.name));
  }
}
scanForbidden(root);

const packageFiles = [];
function findPackageJson(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) findPackageJson(full);
    else if (entry.name === 'package.json') packageFiles.push(path.relative(root, full));
  }
}
findPackageJson(root);
assert.deepEqual(packageFiles, ['package.json'], `Nested project copies detected: ${packageFiles.join(', ')}`);

const idMatches = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
const duplicateIds = [...new Set(idMatches.filter((id, index) => idMatches.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `Duplicate HTML IDs found: ${duplicateIds.join(', ')}`);

const localRefs = [];
for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
  const ref = match[1].split('?')[0].split('#')[0];
  if (!ref || ref.includes('${') || /^(?:https?:|data:|blob:|#)/i.test(ref)) continue;
  localRefs.push(ref.replace(/^\.\//, ''));
}
const missingRefs = [...new Set(localRefs.filter(ref => !fs.existsSync(path.join(root, ref))))];
assert.deepEqual(missingRefs, [], `Missing local assets referenced by index.html: ${missingRefs.join(', ')}`);

console.log('Repository integrity checks passed.');
