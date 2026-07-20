import assert from 'node:assert/strict';
import handler from '../api/chat.js';

function makeResponseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalVisionModel = process.env.OPENAI_MODEL_VISION;
const originalQuickModel = process.env.OPENAI_MODEL_QUICK;

try {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL_VISION = 'vision-test-model';
  process.env.OPENAI_MODEL_QUICK = 'quick-test-model';

  let capturedRequest = null;
  global.fetch = async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify({ answer: 'Image received.', reminders: [] }) })
    };
  };

  const imageResponse = makeResponseRecorder();
  await handler({
    method: 'POST',
    body: {
      system: 'reef system',
      modelMode: 'quick',
      messages: [{ role: 'user', content: 'Analyze the attached reef photo.' }],
      attachments: [{
        kind: 'image',
        name: 'coral.jpg',
        type: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,/9j/2Q=='
      }]
    }
  }, imageResponse);

  assert.equal(imageResponse.statusCode, 200);
  assert.equal(imageResponse.payload.answer, 'Image received.');
  assert.equal(capturedRequest.url, 'https://api.openai.com/v1/responses');
  assert.equal(capturedRequest.body.model, 'vision-test-model');
  assert.ok(Array.isArray(capturedRequest.body.input[0].content));
  assert.deepEqual(capturedRequest.body.input[0].content[0], {
    type: 'input_text',
    text: 'Analyze the attached reef photo.'
  });
  assert.deepEqual(capturedRequest.body.input[0].content[1], {
    type: 'input_image',
    image_url: 'data:image/jpeg;base64,/9j/2Q==',
    detail: 'high'
  });
  assert.match(capturedRequest.body.instructions, /Inspect the image pixels directly/);

  capturedRequest = null;
  const textResponse = makeResponseRecorder();
  await handler({
    method: 'POST',
    body: {
      system: 'reef system',
      modelMode: 'quick',
      messages: [{ role: 'user', content: 'What should I test today?' }]
    }
  }, textResponse);
  assert.equal(textResponse.statusCode, 200);
  assert.equal(capturedRequest.body.model, 'quick-test-model');
  assert.equal(capturedRequest.body.input[0].content, 'What should I test today?');

  capturedRequest = null;
  const invalidResponse = makeResponseRecorder();
  await handler({
    method: 'POST',
    body: {
      messages: [{ role: 'user', content: 'Analyze this.' }],
      attachments: [{ kind: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }]
    }
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.match(invalidResponse.payload.error, /supported JPEG, PNG, WebP, or GIF/);
  assert.equal(capturedRequest, null, 'Invalid images must be rejected before calling OpenAI');

  console.log('chat image input tests passed');
} finally {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalVisionModel === undefined) delete process.env.OPENAI_MODEL_VISION;
  else process.env.OPENAI_MODEL_VISION = originalVisionModel;
  if (originalQuickModel === undefined) delete process.env.OPENAI_MODEL_QUICK;
  else process.env.OPENAI_MODEL_QUICK = originalQuickModel;
}
