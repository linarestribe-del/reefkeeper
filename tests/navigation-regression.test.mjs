import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.match(html, /onclick="showPage\('log'\)"[^>]*><span>📊<\/span><strong>Parameters Log<\/strong>/, 'Parameters Log card should route to log');
assert.match(app, /window\.showPage = function\(name, btn\)\s*\{\s*directGo\(name, btn\);\s*\}/, 'Final showPage override should call directGo once');
assert.doesNotMatch(app, /window\.showPage = function\(name, btn\)\s*\{\s*showPage\(name, btn\)/, 'Final showPage override must not recurse');
assert.match(html, /ai\/evidence-engine\.js\?v=20260717-build-1b/, 'Evidence engine must load before app.js');
assert.ok(html.indexOf('ai/evidence-engine.js?v=20260717-build-1b') < html.indexOf('app.js?v=20260718-build-2d-image-input'), 'Evidence engine must load before app.js');
assert.ok(html.indexOf('ai/trend-engine.js?v=20260718-build-2a') < html.indexOf('ai/trend-chart.js?v=20260718-build-2b'), 'Trend engine must load before the chart module');
assert.ok(html.indexOf('ai/trend-chart.js?v=20260718-build-2b') < html.indexOf('app.js?v=20260718-build-2d-image-input'), 'Trend chart module must load before app.js');
assert.ok(html.indexOf('observer.js?v=20260720-build-2f-publishing-bridge') > html.indexOf('app.js?v=20260718-build-2d-image-input'), 'Observer controller must load after app.js');
const aiRouteIndex = vercel.routes.findIndex(route => route.src === '/ai/(.*)' && route.dest === '/ai/$1');
const fallbackIndex = vercel.routes.findIndex(route => route.src === '/(.*)');
assert.ok(aiRouteIndex >= 0 && aiRouteIndex < fallbackIndex, 'Vercel must serve /ai files before the SPA fallback');

console.log('Navigation regression tests passed.');
