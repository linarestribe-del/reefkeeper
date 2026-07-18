import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app-build-2-6.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.match(html, /onclick="showPage\('log'\)"[^>]*><span>📊<\/span><strong>Parameters Log<\/strong>/, 'Parameters Log card should route to log');
assert.match(app, /window\.showPage = function\(name, btn\)\s*\{\s*directGo\(name, btn\);\s*\}/, 'Final showPage override should call directGo once');
assert.doesNotMatch(app, /window\.showPage = function\(name, btn\)\s*\{\s*showPage\(name, btn\)/, 'Final showPage override must not recurse');
assert.match(html, /ai\/evidence-engine\.js\?v=20260717-build-1b/, 'Evidence engine must load before the main app');
assert.ok(html.indexOf('ai/evidence-engine.js') < html.indexOf('app-build-2-6.js'), 'Evidence engine must load before the main app');
const aiRouteIndex = vercel.routes.findIndex(route => route.src === '/ai/(.*)' && route.dest === '/ai/$1');
const appRouteIndex = vercel.routes.findIndex(route => route.src === '/app-build-2-6.js' && route.dest === '/app-build-2-6.js');
const fallbackIndex = vercel.routes.findIndex(route => route.src === '/(.*)');
assert.ok(aiRouteIndex >= 0 && aiRouteIndex < fallbackIndex, 'Vercel must serve /ai files before the SPA fallback');
assert.ok(appRouteIndex >= 0 && appRouteIndex < fallbackIndex, 'Vercel must serve the Build 2.6 app file before the SPA fallback');

console.log('Navigation regression tests passed.');
