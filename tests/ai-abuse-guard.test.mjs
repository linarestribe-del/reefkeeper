import assert from 'node:assert/strict';
import chatHandler from '../api/chat.js';
import planHandler from '../api/plan.js';
import livestockHandler from '../api/livestock.js';
import photoHandler from '../api/photo-analysis.js';

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

function request(body, ip = '203.0.113.10', extraHeaders = {}) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      ...extraHeaders
    },
    body
  };
}

const originalFetch = global.fetch;
const savedEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  REEF_AI_RATE_WINDOW_SECONDS: process.env.REEF_AI_RATE_WINDOW_SECONDS,
  REEF_AI_CHAT_RATE_LIMIT: process.env.REEF_AI_CHAT_RATE_LIMIT,
  REEF_AI_PLAN_RATE_LIMIT: process.env.REEF_AI_PLAN_RATE_LIMIT,
  REEF_AI_LIVESTOCK_RATE_LIMIT: process.env.REEF_AI_LIVESTOCK_RATE_LIMIT,
  REEF_AI_PHOTO_RATE_LIMIT: process.env.REEF_AI_PHOTO_RATE_LIMIT,
  REEF_AI_ACCESS_KEY: process.env.REEF_AI_ACCESS_KEY,
  REEF_AI_ACCESS_KEYS: process.env.REEF_AI_ACCESS_KEYS
};

try {
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.REEF_AI_ACCESS_KEY;
  delete process.env.REEF_AI_ACCESS_KEYS;
  process.env.REEF_AI_RATE_WINDOW_SECONDS = '600';
  globalThis.__reefkeeperAiRateBuckets?.clear();

  let fetchCount = 0;
  let capturedChatBody = null;
  global.fetch = async (_url, options) => {
    fetchCount += 1;
    const body = JSON.parse(options.body);
    if (body.input?.[0]?.content?.includes?.('days-off plan')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            plan: {
              summary: 'Safe pacing.',
              days: [{ day: 1, title: 'Test', tasks: ['Test alkalinity'] }]
            }
          })
        })
      };
    }
    if (Array.isArray(body.input?.[0]?.content)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            suggestedId: 'uncertain',
            confidence: 'low',
            category: 'other',
            healthStatus: 'uncertain',
            visibleSigns: [],
            healthConcerns: [],
            growthAssessment: '',
            estimatedGrowthPercent: 'unknown',
            bodyCondition: 'unknown',
            timelineComparison: 'insufficient history',
            recommendedActions: [],
            trackingNotes: '',
            saveSuggestion: 'do not save'
          })
        })
      };
    }
    if (String(body.input?.[0]?.content || '').includes('Fill a reef aquarium livestock')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            commonName: 'Test Fish',
            scientificName: 'verify',
            type: 'fish',
            naturalRange: '',
            facts: [],
            notes: ''
          })
        })
      };
    }
    capturedChatBody = body;
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify({ answer: 'ok', reminders: [] }) })
    };
  };

  // Declared oversize requests are rejected before OpenAI is called.
  const oversizedChat = responseRecorder();
  await chatHandler(request(
    { messages: [{ role: 'user', content: 'hello' }] },
    '203.0.113.11',
    { 'content-length': '7500001' }
  ), oversizedChat);
  assert.equal(oversizedChat.statusCode, 413);
  assert.match(oversizedChat.payload.error, /too large/i);
  assert.equal(fetchCount, 0);

  // Actual parsed size wins even when a caller lies with a smaller Content-Length.
  const oversizedPlan = responseRecorder();
  await planHandler(request(
    { system: 'x'.repeat(260_000), planContext: {} },
    '203.0.113.12',
    { 'content-length': '10' }
  ), oversizedPlan);
  assert.equal(oversizedPlan.statusCode, 413);
  assert.equal(fetchCount, 0);

  // Non-JSON requests are rejected before billing work begins.
  const wrongContentType = responseRecorder();
  await livestockHandler(request(
    { commonName: 'Clownfish' },
    '203.0.113.13',
    { 'content-type': 'text/plain' }
  ), wrongContentType);
  assert.equal(wrongContentType.statusCode, 415);
  assert.equal(fetchCount, 0);

  // Chat history is bounded to recent messages and a cumulative text ceiling.
  const messages = Array.from({ length: 40 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `${index}:` + 'x'.repeat(5_000)
  }));
  const boundedChat = responseRecorder();
  await chatHandler(request({ system: 'reef', modelMode: 'quick', messages }, '203.0.113.14'), boundedChat);
  assert.equal(boundedChat.statusCode, 200);
  assert.ok(Array.isArray(capturedChatBody.input));
  assert.ok(capturedChatBody.input.length <= 24, 'Chat input must be capped at 24 recent messages.');
  const totalChatChars = capturedChatBody.input.reduce((sum, item) => sum + String(item.content || '').length, 0);
  assert.ok(totalChatChars <= 96_000, 'Chat input must stay within the cumulative text ceiling.');
  assert.match(String(capturedChatBody.input.at(-1).content), /^39:/, 'The newest chat message must be preserved.');

  // Normal plan and supported-photo requests still reach OpenAI and return usable results.
  const validPlan = responseRecorder();
  await planHandler(request({ system: 'reef', planContext: {}, modelMode: 'quick' }, '203.0.113.15'), validPlan);
  assert.equal(validPlan.statusCode, 200);
  assert.equal(validPlan.payload.plan.days[0].tasks[0], 'Test alkalinity');

  const validPhoto = responseRecorder();
  await photoHandler(request({
    item: { name: 'Test coral' },
    image: { dataUrl: 'data:image/jpeg;base64,/9j/2Q==' },
    previousAnalyses: [],
    tankSummary: ''
  }, '203.0.113.16'), validPhoto);
  assert.equal(validPhoto.statusCode, 200);
  assert.equal(validPhoto.payload.confidence, 'low');

  // The per-client limiter returns 429 and Retry-After after the configured burst allowance.
  process.env.REEF_AI_LIVESTOCK_RATE_LIMIT = '2';
  globalThis.__reefkeeperAiRateBuckets?.clear();
  for (let index = 0; index < 2; index += 1) {
    const allowed = responseRecorder();
    await livestockHandler(request({ commonName: `Test Fish ${index}` }, '203.0.113.20'), allowed);
    assert.equal(allowed.statusCode, 200);
  }
  const limited = responseRecorder();
  await livestockHandler(request({ commonName: 'Third Fish' }, '203.0.113.20'), limited);
  assert.equal(limited.statusCode, 429);
  assert.match(limited.payload.error, /Too many AI requests/i);
  assert.ok(Number(limited.headers['retry-after']) >= 1);

  // A different client remains unaffected by another client's bucket.
  const otherClient = responseRecorder();
  await livestockHandler(request({ commonName: 'Other Client Fish' }, '203.0.113.21'), otherClient);
  assert.equal(otherClient.statusCode, 200);

  // Photo analysis accepts only explicit supported image data URLs.
  const invalidPhoto = responseRecorder();
  await photoHandler(request({ image: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' } }, '203.0.113.30'), invalidPhoto);
  assert.equal(invalidPhoto.statusCode, 400);
  assert.match(invalidPhoto.payload.error, /JPEG, PNG, WebP, or GIF/i);

  console.log('AI abuse guard tests passed.');
} finally {
  global.fetch = originalFetch;
  globalThis.__reefkeeperAiRateBuckets?.clear();
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
