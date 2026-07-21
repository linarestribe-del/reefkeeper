import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

assert.match(html, /tile-title\">Compare Photos<\/span>/, 'AI Vision must show a Compare Photos tile');
assert.match(html, /<strong>Compare photos<\/strong>/, 'AI Vision must show a Compare photos row');
assert.match(html, /onclick=\"startPhotoComparison\(\)\">🆚 Compare Photos<\/button>/, 'Add menu must show Compare Photos');
assert.match(html, /id=\"photo-library-input\"[^>]*multiple/, 'Photo library input must allow multiple selection');
assert.match(app, /function startPhotoComparison\(\)/, 'Comparison helper must be defined');

console.log('Multi-image UI regression tests passed.');
