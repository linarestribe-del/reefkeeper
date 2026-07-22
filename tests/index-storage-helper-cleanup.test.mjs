import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');

for (const helper of ['rkReadStoredJson', 'rkReadStoredArray', 'rkEscapeHtml']) {
  assert.equal((html.match(new RegExp(`function ${helper}\\s*\\(`, 'g')) || []).length, 1, `${helper} must have one canonical implementation.`);
}

for (const retired of [
  'rkSystemCheckReadJson',
  'function readJson(',
  'rkReportReadJson',
  'function esc(',
  'rkReportEsc',
  'rkEquipmentParseArray',
  'rkHomeParseArray',
  'rkHomeNumber'
]) {
  assert.ok(!html.includes(retired), `Retired helper must not return: ${retired}`);
}

assert.ok(html.includes("rkReadStoredJson('reef_logs', [])"), 'System Check, Timeline, or Reports must use the shared JSON reader.');
assert.ok(html.includes("rkReadStoredArray('reef_actions')"), 'Equipment must use the shared array reader.');
assert.ok(html.includes("rkReadStoredArray('reef_ai_reminders')"), 'Home must use the shared array reader.');
assert.ok(html.includes('rkEscapeHtml(event.title'), 'Timeline must use the shared HTML escaper.');
assert.ok(html.includes('rkEscapeHtml(section.title)'), 'Reports must use the shared HTML escaper.');

const start = html.indexOf('function rkReadStoredJson(key, fallback)');
const end = html.indexOf('function rkSystemCheckIcon(state)', start);
assert.ok(start >= 0 && end > start, 'Shared helper block must remain before System Check and later consumers.');
const source = html.slice(start, end);

const data = new Map([
  ['valid-object', JSON.stringify({ ok: true })],
  ['valid-array', JSON.stringify([1, 2, 3])],
  ['wrong-array-shape', JSON.stringify({ length: 3 })],
  ['invalid-json', '{broken']
]);
const sandbox = {
  localStorage: {
    getItem(key) { return data.has(key) ? data.get(key) : null; }
  },
  JSON,
  String,
  Array
};
vm.runInNewContext(source, sandbox, { filename: 'shared-index-helpers.js' });

assert.deepEqual(sandbox.rkReadStoredJson('valid-object', null), { ok: true });
assert.equal(sandbox.rkReadStoredJson('missing', 'fallback'), 'fallback');
assert.equal(sandbox.rkReadStoredJson('invalid-json', 'fallback'), 'fallback');
assert.deepEqual(Array.from(sandbox.rkReadStoredArray('valid-array')), [1, 2, 3]);
assert.deepEqual(Array.from(sandbox.rkReadStoredArray('wrong-array-shape')), []);
assert.deepEqual(Array.from(sandbox.rkReadStoredArray('invalid-json')), []);
assert.equal(sandbox.rkEscapeHtml(`<tag a="x">Tom & Jerry's</tag>`), '&lt;tag a=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/tag&gt;');
assert.equal(sandbox.rkEscapeHtml(null), '');

console.log('Index shared storage helper cleanup regression tests passed.');
