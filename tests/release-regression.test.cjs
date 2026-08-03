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
const filterRollUi = fs.readFileSync('filter-roll-status.js', 'utf8');

assert(html.includes('css/app.css?v=20260729-maintenance-9f1-observer-scoping'));
assert(html.includes('ai/evidence-engine.js?v=20260717-build-1b'));
assert(html.includes('ai/decision-engine.js?v=20260718-build-1c'));
assert(html.includes('ai/explainability.js?v=20260718-build-2c'));
assert(html.includes('ai/trend-engine.js?v=20260718-build-2a'));
assert(html.includes('ai/trend-chart.js?v=20260718-build-2b'));
assert(html.includes('app.js?v=20260729-maintenance-9f1-observer-scoping'));
assert(html.includes('observer.js?v=20260729-maintenance-9f1-observer-scoping'));
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
assert.equal(pkg.version, '4.3.65');
assert.equal(rootCss, css, 'Root and css/ stylesheet copies must remain synchronized');
assert.equal(rootChat, apiChat, 'Root and api/chat.js copies must remain synchronized');
assert(fs.existsSync('tests/index-js-cleanup.test.mjs'));
assert(fs.existsSync('tests/index-handler-render-cleanup.test.mjs'));
assert(fs.existsSync('tests/index-data-snapshot-cleanup.test.mjs'));
assert(fs.existsSync('tests/index-storage-helper-cleanup.test.mjs'));
assert(fs.existsSync('tests/javascript-syntax.test.mjs'));
assert(fs.existsSync('tests/global-function-integrity.test.mjs'));
assert(fs.existsSync('tests/dom-reference-integrity.test.mjs'));
assert(fs.existsSync('tests/stable-baseline.test.mjs'));
assert(fs.existsSync('tests/mobile-ui-positioning.test.mjs'));
for (const file of ['MAINTENANCE_8D_RELEASE_MANIFEST.md', 'MAINTENANCE_8D_TEST_REPORT.md', 'checksums/maintenance-8D.sha256']) {
  assert(fs.existsSync(file), `Maintenance 8D release file is missing: ${file}`);
}
assert(fs.existsSync('tests/ai-abuse-guard.test.mjs'));
assert(fs.existsSync('tests/ai-access-control.test.mjs'));
assert(html.includes('id="reef-ai-access-key"'));
assert(html.includes('Reef Keeper v4.3.65 Maintenance 9K.1'));
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
assert(vercel.routes.some(route => route.src === '/connector/(.*)' && route.dest === '/connector/$1'), 'Pi publisher must be downloadable from the stable app origin.');
assert.equal(pkg.dependencies?.['@vercel/blob'], undefined);
assert(fs.existsSync('lib/observer-r2.js'));
assert(fs.existsSync('lib/observer-blob.js'));
assert(!fs.readFileSync('lib/observer-blob.js', 'utf8').includes('@vercel/blob'));
assert(fs.readFileSync('lib/observer-blob.js', 'utf8').includes("export * from './observer-r2.js'"));
assert(fs.existsSync('tests/observer-r2-storage.test.mjs'));
assert(fs.existsSync('tests/observer-publisher-daily-budget.test.py'));
assert(fs.readFileSync('api/observer-publish.js', 'utf8').includes('../lib/observer-r2.js'));
assert(fs.readFileSync('api/observer-status.js', 'utf8').includes('../lib/observer-r2.js'));
assert(fs.readFileSync('api/observer-image.js', 'utf8').includes('../lib/observer-r2.js'));

// Maintenance 8D dual-camera Observer safeguards.
assert(fs.existsSync('connector/install-observer-publisher-2.8.1.sh'));
assert(fs.existsSync('tests/observer-dual-camera.test.mjs'));
assert(fs.existsSync('tests/observer-dual-camera-api.test.mjs'));
assert(fs.existsSync('tests/observer-dual-camera-publisher.test.py'));
assert(fs.existsSync('tests/observer-filter-roll.test.py'));
assert(fs.existsSync('tests/filter-roll-status.test.mjs'));
assert(fs.existsSync('filter-roll-engine.js'));
assert(fs.existsSync('filter-roll-status.js'));
assert(fs.existsSync('filter-roll-status.css'));
assert(fs.existsSync('connector/observer-filter-roll-calibrate.py'));
assert(fs.readFileSync('connector/observer-publisher.py', 'utf8').includes('outer silhouette'));
assert(html.includes('id="observer-filter-roll-status-mount"'));
assert(filterRollUi.includes('id="observer-filter-roll-current-diameter"'));
assert(filterRollUi.includes('initializeExistingFilterRollFromForm(event)'));
assert(html.includes('id="observer-camera-overview"'));
assert(html.includes('id="observer-camera-return"'));
assert(fs.readFileSync('connector/observer-publisher.py', 'utf8').includes("PUBLISHER_VERSION = '2.8.1'"));
assert(fs.readFileSync('lib/observer-common.js', 'utf8').includes('OBSERVER_SCHEMA_VERSION = 10'));
assert(fs.readFileSync('api/observer-publish.js', 'utf8').includes("cameraId === 'return'"));
assert(fs.readFileSync('api/observer-image.js', 'utf8').includes("cameraId === 'return'"));


// Maintenance 9C Integration Core safeguards.
assert(fs.existsSync('integration-core.js'));
assert(fs.existsSync('tests/integration-core.test.mjs'));
assert(html.includes('integration-core.js?v=20260729-maintenance-9f1-observer-scoping'));
assert(html.includes('id="action-equipment"'));
assert(html.includes('id="action-code"'));
assert(app.includes("'reef_tank_events_v1'"));
assert(app.includes("'reef_observer_filter_roll_state_v1'"));
for (const file of ['MAINTENANCE_9C_RELEASE_MANIFEST.md', 'MAINTENANCE_9C_TEST_REPORT.md', 'checksums/maintenance-9C.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9C release file is missing: ${file}`);
}
for (const file of ['MAINTENANCE_9C_2_RELEASE_MANIFEST.md', 'MAINTENANCE_9C_2_TEST_REPORT.md', 'checksums/maintenance-9C2.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9C.2 release file is missing: ${file}`);
}
for (const file of ['MAINTENANCE_9D_RELEASE_MANIFEST.md', 'MAINTENANCE_9D_TEST_REPORT.md', 'checksums/maintenance-9D.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9D release file is missing: ${file}`);
}
for (const file of ['MAINTENANCE_9E_RELEASE_MANIFEST.md', 'MAINTENANCE_9E_TEST_REPORT.md', 'checksums/maintenance-9E.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9E release file is missing: ${file}`);
}
for (const file of ['MAINTENANCE_9E_1_RELEASE_MANIFEST.md', 'MAINTENANCE_9E_1_TEST_REPORT.md', 'checksums/maintenance-9E1.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9E.1 release file is missing: ${file}`);
}
for (const file of ['MAINTENANCE_9F_RELEASE_MANIFEST.md', 'MAINTENANCE_9F_TEST_REPORT.md', 'checksums/maintenance-9F.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9F/9F.1 release file is missing: ${file}`);
}
assert(fs.existsSync('tests/observer-9f-reliability.test.py'));
for (const file of ['MAINTENANCE_9C_3_RELEASE_MANIFEST.md', 'MAINTENANCE_9C_3_TEST_REPORT.md', 'checksums/maintenance-9C3.sha256']) {
  assert(fs.existsSync(file), `Maintenance 9C.3 release file is missing: ${file}`);
}

// Parameter Log recursion regression: direct routing must remain present and recursive body absent.
assert(html.includes("rkDirectGo('log')") || html.includes('rkDirectGo("log")'));
assert(!/function\s+showPage\s*\([^)]*\)\s*\{\s*showPage\s*\(/.test(html));


// Maintenance 9K.1 Cloudflare Worker Observer backend safeguards.
assert(fs.existsSync('cloudflare/observer-worker.js'));
assert(fs.existsSync('cloudflare/wrangler.toml.example'));
assert(fs.existsSync('docs/OBSERVER_CLOUDFLARE_WORKER_9K.md'));
assert(fs.existsSync('connector/configure-observer-worker-endpoint.sh'));
assert(fs.existsSync('tests/observer-9k-cloudflare-worker.test.mjs'));
assert(fs.readFileSync('cloudflare/observer-worker.js', 'utf8').includes('cloudflare-worker-r2'));
assert(fs.readFileSync('cloudflare/observer-worker.js', 'utf8').includes('OBSERVER_BUCKET'));
assert(fs.readFileSync('cloudflare/observer-worker.js', 'utf8').includes('REEF_OBSERVER_WRITE_TOKEN'));
assert(fs.readFileSync('connector/configure-observer-worker-endpoint.sh', 'utf8').includes('/api/observer-publish'));

console.log('release regression tests passed');
