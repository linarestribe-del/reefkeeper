import assert from 'node:assert/strict';
import chatHandler from '../api/chat.js';
import planHandler from '../api/plan.js';
import livestockHandler from '../api/livestock.js';
import photoHandler from '../api/photo-analysis.js';

const handlers = [
  ['chat', chatHandler],
  ['plan', planHandler],
  ['livestock', livestockHandler],
  ['photo-analysis', photoHandler]
];

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function request(headers = {}) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'x-forwarded-for': '203.0.113.50',
      ...headers
    },
    body: '{}'
  };
}

const savedEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  REEF_AI_ACCESS_KEY: process.env.REEF_AI_ACCESS_KEY,
  REEF_AI_ACCESS_KEYS: process.env.REEF_AI_ACCESS_KEYS
};
const originalFetch = global.fetch;

try {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.REEF_AI_ACCESS_KEY = 'correct-horse-battery-staple-reefkeeper';
  delete process.env.REEF_AI_ACCESS_KEYS;

  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    throw new Error('OpenAI must not be called by access-control validation tests.');
  };

  for (const [name, handler] of handlers) {
    const missing = responseRecorder();
    await handler(request(), missing);
    assert.equal(missing.statusCode, 401, `${name} must reject a missing access key.`);
    assert.equal(missing.payload?.code, 'REEF_AI_ACCESS_REQUIRED');
    assert.equal(missing.headers['x-reef-ai-access'], 'denied');

    const wrong = responseRecorder();
    await handler(request({ 'x-reef-ai-access-key': 'wrong-key' }), wrong);
    assert.equal(wrong.statusCode, 401, `${name} must reject an incorrect access key.`);
    assert.equal(wrong.headers['x-reef-ai-access'], 'denied');

    const accepted = responseRecorder();
    await handler(request({ 'x-reef-ai-access-key': 'correct-horse-battery-staple-reefkeeper' }), accepted);
    assert.equal(accepted.statusCode, 415, `${name} must continue to normal request validation after authentication.`);
    assert.equal(accepted.headers['x-reef-ai-access'], 'accepted');
  }

  // Authorization: Bearer is supported for safe command-line verification and key rotation.
  const bearer = responseRecorder();
  await chatHandler(request({ authorization: 'Bearer correct-horse-battery-staple-reefkeeper' }), bearer);
  assert.equal(bearer.statusCode, 415);
  assert.equal(bearer.headers['x-reef-ai-access'], 'accepted');

  // A comma/newline-separated rotation list accepts either configured key.
  delete process.env.REEF_AI_ACCESS_KEY;
  process.env.REEF_AI_ACCESS_KEYS = 'old-reefkeeper-access-key-0001,\nnew-reefkeeper-access-key-0002';
  const rotated = responseRecorder();
  await planHandler(request({ 'x-reef-ai-access-key': 'new-reefkeeper-access-key-0002' }), rotated);
  assert.equal(rotated.statusCode, 415);
  assert.equal(rotated.headers['x-reef-ai-access'], 'accepted');

  // Staged deployment remains non-breaking until Vercel receives a configured key.
  delete process.env.REEF_AI_ACCESS_KEY;
  delete process.env.REEF_AI_ACCESS_KEYS;
  const staged = responseRecorder();
  await livestockHandler(request(), staged);
  assert.equal(staged.statusCode, 415);
  assert.equal(staged.headers['x-reef-ai-access'], 'not-configured');

  assert.equal(fetchCount, 0, 'Access-control tests must never call OpenAI.');
  console.log('AI access control tests passed.');
} finally {
  global.fetch = originalFetch;
  globalThis.__reefkeeperAiRateBuckets?.clear();
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
