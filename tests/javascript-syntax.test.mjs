import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const skippedDirectories = new Set(['.git', 'node_modules']);
const sourceExtensions = new Set(['.js', '.mjs', '.cjs']);
const sourceFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (sourceExtensions.has(path.extname(entry.name))) sourceFiles.push(full);
  }
}
walk(root);

for (const file of sourceFiles.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `JavaScript syntax check failed for ${path.relative(root, file)}:\n${result.stderr || result.stdout}`,
  );
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let scriptNumber = 0;
while ((match = scriptPattern.exec(html))) {
  scriptNumber += 1;
  if (/\bsrc\s*=/.test(match[1])) continue;
  assert.doesNotThrow(
    () => new vm.Script(match[2], { filename: `index.html:inline-${scriptNumber}` }),
    undefined,
    `Inline script ${scriptNumber} in index.html must parse as JavaScript.`,
  );
}

console.log(`JavaScript syntax checks passed for ${sourceFiles.length} files and ${scriptNumber} index script tags.`);
