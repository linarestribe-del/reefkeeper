import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const apiDir = path.join(root, 'api');
const supportedExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.py', '.go']);

function listFunctionFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...listFunctionFiles(fullPath));
    else if (supportedExtensions.has(path.extname(entry.name).toLowerCase()) && !entry.name.endsWith('.d.ts')) {
      output.push(path.relative(root, fullPath).replaceAll(path.sep, '/'));
    }
  }
  return output.sort();
}

const functions = listFunctionFiles(apiDir);
const hobbyLimit = 12;

assert.ok(functions.length > 0, 'No Vercel functions were found under api/.');
assert.ok(
  functions.length <= hobbyLimit,
  `Vercel Hobby limit exceeded: found ${functions.length} functions, maximum ${hobbyLimit}.\n${functions.join('\n')}`
);

console.log(`Vercel function count passed: ${functions.length}/${hobbyLimit}`);
for (const file of functions) console.log(`- ${file}`);
