const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const vision = fs.readFileSync('vision.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const rootCss = fs.readFileSync('app.css', 'utf8');
const rootChat = fs.readFileSync('chat.js', 'utf8');
const apiChat = fs.readFileSync('api/chat.js', 'utf8');

assert(html.includes('css/app.css?v=20260721-maintenance-5c-ai-access'));
assert(html.includes('ai/evidence-engine.js?v=20260717-build-1b'));
assert(html.includes('ai/decision-engine.js?v=20260718-build-1c'));
assert(html.includes('ai/explainability.js?v=20260718-build-2c'));
assert(html.includes('ai/trend-engine.js?v=20260718-build-2a'));
assert(html.includes('ai/trend-chart.js?v=20260718-build-2b'));
assert(html.includes('app.js?v=20260721-maintenance-5c-ai-access'));
assert(html.includes('observer.js?v=20260721-build-2l1-hobby-plan-fix'));
assert(app.includes('window.ReefKeeperDecisionEngine.evaluate(evidenceContext)'));
assert(app.includes('window.ReefKeeperExplainability.build'));
assert(app.includes('Evidence review'));
assert(app.includes('Strongest evidence'));
assert(app.includes('Missing or stale'));
assert(app.includes('Skeptic check'));
assert(app.includes('Action limit'));
assert(css.includes('Build 2C: deterministic evidence review inside Ask AI responses'));
assert(css.includes('Build 2D: real multimodal image input for Ask AI'));
assert(css.includes('Build 2E: Aquarium Observer remote-ready interface'));
assert(app.includes("async function askOpenAI(userMsg, history, modelMode = getModelMode(), attachments = [])"));
assert(app.includes("kind: 'image'"));
assert(app.includes('prepareAskAiImage'));
assert(html.includes('id="attachment-preview"'));
assert(!app.includes('this text-only AI endpoint does not analyze the image pixels yet'));
assert(app.includes('window.ReefKeeperTrendEngine'));
assert(app.includes('Relevant logged events in this period'));
assert(css.includes('Build 2A: deterministic parameter analytics'));
assert(css.includes('Build 2B: touch-friendly parameter graph presentation'));
assert(app.includes('window.ReefKeeperTrendChart'));
assert(app.includes('Tap or drag across the graph to inspect'));

assert(app.includes('let activePointerId = null;'));
assert(app.includes("svg.addEventListener('pointerup', endPointerDrag)"));
assert(app.includes("event.pointerType === 'mouse' || isActiveDrag"));
assert(!app.includes("if (event.pointerType === 'mouse') inspectClientX(event.clientX);"));
assert(fs.existsSync('ai/trend-chart.js'));
assert(fs.existsSync('ai/explainability.js'));
assert.equal(pkg.version, '4.3.37');
assert.equal(rootCss, css, 'Root and css/ stylesheet copies must remain synchronized');
assert.equal(rootChat, apiChat, 'Root and api/chat.js copies must remain synchronized');
assert(fs.existsSync('tests/index-js-cleanup.test.mjs'));
assert(fs.existsSync('tests/index-handler-render-cleanup.test.mjs'));
assert(fs.existsSync('tests/ai-abuse-guard.test.mjs'));
assert(fs.existsSync('tests/ai-access-control.test.mjs'));
assert(html.includes('id="reef-ai-access-key"'));
assert(html.includes('Reef Keeper v4.3.37 Maintenance 6C'));
assert(app.includes("const REEF_AI_ACCESS_STORAGE_KEY = 'reef_ai_access_key_v1'"));
assert(app.includes("headers['X-Reef-AI-Access-Key'] = key"));
assert(app.includes('function testReefAiAccessKey()'));
assert((app.match(/headers:\s*reefAiHeaders/g) || []).length >= 4, 'All app.js paid-AI requests must attach the device key.');
assert((html.match(/ReefKeeperAiAccess\?\.headers/g) || []).length >= 2, 'Inline paid-AI requests must attach the device key.');
assert(vision.includes('ReefKeeperAiAccess?.headers'), 'AI Vision must attach the device key.');
const backupKeysMatch = app.match(/const REEF_BACKUP_KEYS = \[[\s\S]*?\n\];/);
assert(backupKeysMatch, 'Backup key list must remain present.');
assert(!backupKeysMatch[0].includes('reef_ai_access_key_v1'), 'AI access key must not be included in user backups.');
for (const file of ['chat.js', 'plan.js', 'livestock.js', 'photo-analysis.js']) {
  assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(`api/${file}`, 'utf8'), `${file} root/API copies must remain synchronized`);
  const apiSource = fs.readFileSync(`api/${file}`, 'utf8');
  assert(apiSource.includes('Maintenance 5B'), `${file} must retain paid-AI request guards`);
  assert(apiSource.includes('Maintenance 5C'), `${file} must require the shared access key when configured`);
  assert(apiSource.includes('enforcePaidAiAccess(req, res)'), `${file} must enforce paid-AI access before OpenAI work`);
}
assert(apiChat.includes('MAX_CHAT_MESSAGES = 24'));
assert(apiChat.includes('MAX_CHAT_TEXT_CHARS = 96_000'));
assert(apiChat.includes("rateLimitEnv: 'REEF_AI_CHAT_RATE_LIMIT'"));
assert(vercel.routes.some((route) => route.src === '/ai/(.*)' && route.dest === '/ai/$1'));

// Build 2C must not reintroduce the experimental Why control or rename core assets.
assert(!html.includes('Why? Build'));
assert(!html.includes('app-build-'));
assert(fs.existsSync('app.js'));
assert(fs.existsSync('css/app.css'));
assert(fs.existsSync('observer.js'));
assert(fs.existsSync('api/observer-status.js'));
assert(fs.existsSync('api/observer-publish.js'));
assert(fs.existsSync('api/observer-image.js'));
assert(!fs.existsSync('api/observer-timelapses.js'));
assert(!fs.existsSync('api/observer-timelapse.js'));
assert.equal(fs.readdirSync('api').filter(name => name.endsWith('.js')).length, 12, 'Hobby plan function count must remain at 12 or fewer');
assert(fs.existsSync('connector/observer-publisher.py'));
assert.equal(pkg.dependencies['@vercel/blob'], '^2.3.0');

// Parameter Log recursion regression: direct routing must remain present and recursive body absent.
assert(html.includes("rkDirectGo('log')") || html.includes('rkDirectGo("log")'));
assert(!/function\s+showPage\s*\([^)]*\)\s*\{\s*showPage\s*\(/.test(html));

console.log('release regression tests passed');
