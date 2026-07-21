import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(config.functions?.['api/chat.js']?.maxDuration, 60, 'api/chat.js must have enough time for image analysis');

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(app, /The AI request ended before the server finished/, 'Client should explain browser-level request termination');

console.log('Vision timeout regression checks passed.');
