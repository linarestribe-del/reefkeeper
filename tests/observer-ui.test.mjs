import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/observer-status.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.match(html, /id="page-observer"/, 'Observer detail page must exist');
assert.match(html, /id="observer-preview-image"/, 'AI Vision should include latest-image preview');
assert.match(html, /onclick="openAquariumObserver\(\)"/, 'Observer must be reachable from the app UI');
assert.match(html, /id="observer-analyze-btn"[^>]*disabled/, 'Analyze should remain disabled until a remote image reference exists');
assert.match(observer, /const STATUS_ENDPOINT = '\/api\/observer-status'/, 'Observer must use the same-origin status endpoint');
assert.match(observer, /STale_AFTER_MS|STALE_AFTER_MS/, 'Observer must detect stale captures');
assert.match(observer, /prepareAskAiImage\(file\)/, 'A remote selected image should reuse the tested Ask AI image pipeline');
assert.match(api, /Image bytes are accepted only by \/api\/observer-publish/, 'Metadata endpoint must route image bytes to the publishing endpoint');
assert.doesNotMatch(observer, /192\.168\./, 'Browser controller must not embed a private home-network address');
assert.doesNotMatch(api, /rtsp:\/\//i, 'Remote endpoint must not embed an RTSP URL');

const observerRoute = vercel.routes.findIndex(route => route.src === '/observer.js' && route.dest === '/observer.js');
const fallbackRoute = vercel.routes.findIndex(route => route.src === '/(.*)');
assert.ok(observerRoute >= 0 && observerRoute < fallbackRoute, 'observer.js must be served before the SPA fallback');

console.log('Aquarium Observer UI regression tests passed.');

assert.match(css, /\.observer-image-placeholder\[hidden\][\s\S]*?display:\s*none\s*!important/, 'Loaded Observer images must fully hide the placeholder overlay');
assert.match(observer, /placeholder\.style\.display\s*=\s*visible\s*\?\s*['"]flex['"]\s*:\s*['"]none['"]/, 'Observer controller must explicitly control placeholder display');

assert.match(css, /\.observer-image-placeholder\s*\{[\s\S]*?display:\s*none\s*;/, 'Observer placeholder must be hidden by default');
assert.match(css, /\.observer-image-placeholder\.is-visible[\s\S]*?display:\s*flex\s*;/, 'Observer placeholder must require an explicit visible state');
assert.match(observer, /setPlaceholderVisible\(placeholder, false\);[\s\S]*?image\.src/, 'Placeholder must be removed before a remote image starts loading');
assert.match(html, /observer-detail-placeholder[^>]*is-visible|is-visible[^>]*observer-detail-placeholder/, 'Offline detail placeholder must start in an explicit visible state');
