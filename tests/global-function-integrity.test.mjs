import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function maskNonCode(source) {
  const chars = [...source];
  let index = 0;
  let canStartRegex = true;
  const blank = (start, end) => {
    for (let i = start; i < end; i += 1) {
      if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    }
  };

  while (index < chars.length) {
    const current = chars[index];
    const next = chars[index + 1];
    if (/\s/.test(current)) { index += 1; continue; }

    if (current === '/' && next === '/') {
      let end = index + 2;
      while (end < chars.length && chars[end] !== '\n') end += 1;
      blank(index, end);
      index = end;
      continue;
    }
    if (current === '/' && next === '*') {
      let end = index + 2;
      while (end < chars.length - 1 && !(chars[end] === '*' && chars[end + 1] === '/')) end += 1;
      end = Math.min(chars.length, end + 2);
      blank(index, end);
      index = end;
      continue;
    }
    if (current === '"' || current === "'") {
      const quote = current;
      let end = index + 1;
      while (end < chars.length) {
        if (chars[end] === '\\') { end += 2; continue; }
        if (chars[end] === quote) { end += 1; break; }
        end += 1;
      }
      blank(index, end);
      index = end;
      canStartRegex = false;
      continue;
    }
    if (current === '`') {
      let end = index + 1;
      while (end < chars.length) {
        if (chars[end] === '\\') { end += 2; continue; }
        if (chars[end] === '`') { end += 1; break; }
        end += 1;
      }
      blank(index, end);
      index = end;
      canStartRegex = false;
      continue;
    }
    if (current === '/' && canStartRegex) {
      let end = index + 1;
      let inCharacterClass = false;
      while (end < chars.length) {
        if (chars[end] === '\\') { end += 2; continue; }
        if (chars[end] === '[') { inCharacterClass = true; end += 1; continue; }
        if (chars[end] === ']') { inCharacterClass = false; end += 1; continue; }
        if (chars[end] === '/' && !inCharacterClass) {
          end += 1;
          while (/[a-z]/i.test(chars[end] || '')) end += 1;
          break;
        }
        if (chars[end] === '\n') break;
        end += 1;
      }
      blank(index, end);
      index = end;
      canStartRegex = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(current)) {
      let end = index + 1;
      while (/[\w$]/.test(chars[end] || '')) end += 1;
      const word = source.slice(index, end);
      canStartRegex = /^(return|throw|case|delete|void|typeof|instanceof|in|of|new|yield|await|else|do)$/.test(word);
      index = end;
      continue;
    }
    if (/[0-9]/.test(current)) {
      let end = index + 1;
      while (/[\w.]/.test(chars[end] || '')) end += 1;
      index = end;
      canStartRegex = false;
      continue;
    }

    canStartRegex = '([{=,:;!?&|+-*%^~<>'.includes(current);
    index += 1;
  }

  return chars.join('');
}

function topLevelFunctionNames(source) {
  const masked = maskNonCode(source);
  const names = [];
  let braceDepth = 0;
  const tokenPattern = /\bfunction\b|[{}]/g;
  let token;
  while ((token = tokenPattern.exec(masked))) {
    if (token[0] === '{') { braceDepth += 1; continue; }
    if (token[0] === '}') { braceDepth = Math.max(0, braceDepth - 1); continue; }
    if (braceDepth !== 0) continue;
    const declaration = /^function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(masked.slice(token.index));
    if (declaration) names.push(declaration[1]);
  }
  return names;
}

const browserScripts = [];
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptPattern.exec(html))) {
  const srcMatch = /\bsrc=["']([^"']+)["']/.exec(match[1]);
  if (!srcMatch) {
    browserScripts.push({ file: 'index.html', source: match[2] });
    continue;
  }
  const src = srcMatch[1].split('?')[0];
  if (/^https?:/i.test(src)) continue;
  browserScripts.push({ file: src, source: fs.readFileSync(path.join(root, src), 'utf8') });
}

const declarations = new Map();
for (const script of browserScripts) {
  for (const name of topLevelFunctionNames(script.source)) {
    if (!declarations.has(name)) declarations.set(name, []);
    declarations.get(name).push(script.file);
  }
}

const duplicates = new Map([...declarations].filter(([, files]) => files.length > 1));
const allowedDuplicates = new Map([
  ['showPage', ['app.js', 'index.html']],
]);

assert.deepEqual(
  [...duplicates.keys()].sort(),
  [...allowedDuplicates.keys()].sort(),
  `Unexpected duplicate global function declarations: ${[...duplicates.keys()].join(', ')}`,
);
for (const [name, expectedFiles] of allowedDuplicates) {
  assert.deepEqual(
    [...duplicates.get(name)].sort(),
    [...expectedFiles].sort(),
    `${name} must remain only as the app.js implementation plus the tested index.html compatibility router.`,
  );
}

console.log(`Global function integrity checks passed across ${browserScripts.length} browser scripts.`);
