const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

assert(html.includes('css/app.css?v=20260718-build-2a-analytics'));
assert(html.includes('ai/evidence-engine.js?v=20260717-build-1b'));
assert(html.includes('ai/decision-engine.js?v=20260718-build-1c'));
assert(html.includes('ai/trend-engine.js?v=20260718-build-2a'));
assert(html.includes('app.js?v=20260718-build-2a-analytics'));
assert(app.includes('window.ReefKeeperDecisionEngine.evaluate(evidenceContext)'));
assert(app.includes('window.ReefKeeperTrendEngine'));
assert(app.includes('Relevant logged events in this period'));
assert(css.includes('Build 2A: deterministic parameter analytics'));
assert(vercel.routes.some((route) => route.src === '/ai/(.*)' && route.dest === '/ai/$1'));

// Build 2A must not reintroduce the experimental Why control or rename core assets.
assert(!html.includes('Why? Build'));
assert(!html.includes('app-build-'));
assert(fs.existsSync('app.js'));
assert(fs.existsSync('css/app.css'));

// Parameter Log recursion regression: direct routing must remain present and recursive body absent.
assert(html.includes("rkDirectGo('log')") || html.includes('rkDirectGo("log")'));
assert(!/function\s+showPage\s*\([^)]*\)\s*\{\s*showPage\s*\(/.test(html));

console.log('release regression tests passed');
