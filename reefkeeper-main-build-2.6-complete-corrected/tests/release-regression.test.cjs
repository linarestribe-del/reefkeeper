const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html','utf8');
const app = fs.readFileSync('app-build-2-6.js','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
assert(html.includes('ai/evidence-engine.js?v=20260717-build-1b'));
assert(html.includes('ai/decision-engine.js?v=20260718-build-1c'));
assert(html.includes('app-build-2-6.js'));
assert(app.includes('window.ReefKeeperDecisionEngine.evaluate(evidenceContext)'));
assert(app.includes('${structuredEvidenceContext}${decisionReviewContext}'));
assert(vercel.routes.some(r => r.src === '/ai/(.*)' && r.dest === '/ai/$1'));
assert(vercel.routes.some(r => r.src === '/app-build-2-6.js' && r.dest === '/app-build-2-6.js'));
assert(html.includes('id="latest-ai-why-wrap"'));
assert(html.includes('Build 2.6'));
// Parameter Log recursion regression: direct routing must remain present and recursive body absent.
assert(html.includes("rkDirectGo('log')") || html.includes('rkDirectGo("log")'));
assert(!/function\s+showPage\s*\([^)]*\)\s*\{\s*showPage\s*\(/.test(html));
console.log('release regression tests passed');
