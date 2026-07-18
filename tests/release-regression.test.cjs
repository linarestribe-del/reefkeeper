const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html','utf8');
const app = fs.readFileSync('app.js','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
assert(html.includes('ai/evidence-engine.js?v=20260717-build-1b'));
assert(html.includes('ai/decision-engine.js?v=20260718-build-1c'));
assert(app.includes('window.ReefKeeperDecisionEngine.evaluate(evidenceContext)'));
assert(app.includes('${structuredEvidenceContext}${decisionReviewContext}'));
assert(vercel.routes.some(r => r.src === '/ai/(.*)' && r.dest === '/ai/$1'));
// Parameter Log recursion regression: direct routing must remain present and recursive body absent.
assert(html.includes("rkDirectGo('log')") || html.includes('rkDirectGo("log")'));
assert(!/function\s+showPage\s*\([^)]*\)\s*\{\s*showPage\s*\(/.test(html));
console.log('release regression tests passed');
