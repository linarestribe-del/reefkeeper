import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const staticIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]));

const browserFiles = [
  'index.html',
  'app.js',
  'observer.js',
  'vision.js',
  'apex-connect.js',
  'apex-bridge.js',
  'apex-dashboard.js',
];
const sources = new Map(browserFiles.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const combinedSource = [...sources.values()].join('\n');

const dynamicIds = new Set([
  ...combinedSource.matchAll(/\.id\s*=\s*["']([^"']+)["']/g),
  ...combinedSource.matchAll(/\bid=["']([^"']+)["']/g),
].map(match => match[1]));

const literalReferences = [];
const patterns = [
  /getElementById\(\s*["']([^"']+)["']\s*\)/g,
  /querySelector(?:All)?\(\s*["']#([A-Za-z0-9_:\-.]+)["']\s*\)/g,
];
for (const [file, source] of sources) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) literalReferences.push({ id: match[1], file });
  }
}

const optionalLegacyIds = new Set([
  'days-off-summary',
  'saved-ai-reminders',
  'vision-current-mode',
  'vision-file-input',
  'vision-mode-select',
  'vision-preview',
  'vision-result-card',
  'vision-target-select',
]);

const unresolved = literalReferences.filter(({ id }) => (
  !staticIds.has(id) && !dynamicIds.has(id) && !optionalLegacyIds.has(id)
));
assert.deepEqual(
  unresolved,
  [],
  `Literal DOM references without a static, dynamic, or documented optional element: ${unresolved.map(item => `${item.file}#${item.id}`).join(', ')}`,
);

for (const id of optionalLegacyIds) {
  assert.ok(
    literalReferences.some(reference => reference.id === id),
    `Optional DOM allowlist entry is stale and should be reviewed: ${id}`,
  );
}

console.log(`DOM reference integrity checks passed for ${literalReferences.length} literal element references.`);
