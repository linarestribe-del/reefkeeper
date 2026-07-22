// Reef Keeper Maintenance 5B — request-size and best-effort burst controls for paid AI endpoints.
// The in-memory limiter persists only within a warm serverless instance. It reduces accidental
// and simple burst abuse, but it is not a substitute for a future authenticated access layer.
const AI_RATE_BUCKETS = globalThis.__reefkeeperAiRateBuckets || new Map();
if (!globalThis.__reefkeeperAiRateBuckets) globalThis.__reefkeeperAiRateBuckets = AI_RATE_BUCKETS;

function aiHeader(req, name) {
  const headers = req && req.headers && typeof req.headers === 'object' ? req.headers : {};
  const value = headers[String(name || '').toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function aiPositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function aiBodyBytes(req) {
  const declaredValue = Number.parseInt(aiHeader(req, 'content-length'), 10);
  const declared = Number.isFinite(declaredValue) && declaredValue >= 0 ? declaredValue : 0;
  try {
    const body = req && req.body;
    let measured = 0;
    if (body === undefined || body === null) measured = 0;
    else if (Buffer.isBuffer(body)) measured = body.length;
    else if (typeof body === 'string') measured = Buffer.byteLength(body, 'utf8');
    else measured = Buffer.byteLength(JSON.stringify(body), 'utf8');
    return Math.max(declared, measured);
  } catch (error) {
    return Number.MAX_SAFE_INTEGER;
  }
}

function aiClientKey(req) {
  const forwarded = aiHeader(req, 'x-forwarded-for')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const candidate = forwarded.at(-1)
    || aiHeader(req, 'x-real-ip').trim()
    || aiHeader(req, 'x-vercel-forwarded-for').trim()
    || String(req?.socket?.remoteAddress || '').trim()
    || 'unknown';
  return candidate.replace(/[^a-z0-9:._-]/gi, '').slice(0, 96) || 'unknown';
}

function aiPruneRateBuckets(now, windowMs) {
  if (AI_RATE_BUCKETS.size < 512) return;
  for (const [key, bucket] of AI_RATE_BUCKETS) {
    if (!bucket || now - bucket.startedAt > windowMs * 2) AI_RATE_BUCKETS.delete(key);
  }
}

function guardPaidAiRequest(req, res, policy) {
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');

  const contentType = aiHeader(req, 'content-type').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json.' });
    return true;
  }

  const maxBodyBytes = aiPositiveInteger(
    process.env[policy.bodyLimitEnv],
    policy.maxBodyBytes,
    1024,
    8_000_000
  );
  if (aiBodyBytes(req) > maxBodyBytes) {
    res.status(413).json({ error: policy.bodyLimitMessage || 'Request is too large.' });
    return true;
  }

  const windowSeconds = aiPositiveInteger(process.env.REEF_AI_RATE_WINDOW_SECONDS, 600, 60, 3600);
  const windowMs = windowSeconds * 1000;
  const requestLimit = aiPositiveInteger(
    process.env[policy.rateLimitEnv],
    policy.requestsPerWindow,
    1,
    300
  );
  const now = Date.now();
  aiPruneRateBuckets(now, windowMs);
  const key = `${policy.name}:${aiClientKey(req)}`;
  let bucket = AI_RATE_BUCKETS.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
  }
  if (bucket.count >= requestLimit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000));
    res.setHeader?.('Retry-After', String(retryAfter));
    res.status(429).json({ error: `Too many AI requests. Try again in about ${retryAfter} seconds.` });
    return true;
  }
  bucket.count += 1;
  AI_RATE_BUCKETS.set(key, bucket);
  return false;
}

const MAX_IMAGE_COUNT = 4;
const MAX_CHAT_MESSAGES = 24;
const MAX_CHAT_TEXT_CHARS = 96_000;
const MAX_IMAGE_DATA_URL_CHARS = 3_400_000;
const MAX_TOTAL_IMAGE_DATA_URL_CHARS = 6_800_000;
const SUPPORTED_IMAGE_DATA_URL = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[a-z0-9+/=\r\n]+$/i;

function normalizeImageAttachments(value) {
  if (value === undefined || value === null) return { images: [], error: null, status: 200 };
  if (!Array.isArray(value)) {
    return { images: [], error: 'Attachments must be an array.', status: 400 };
  }

  const requested = value.slice(0, MAX_IMAGE_COUNT);
  const images = [];
  let totalChars = 0;

  for (const item of requested) {
    if (!item || item.kind !== 'image') continue;
    const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl.trim() : '';
    if (!SUPPORTED_IMAGE_DATA_URL.test(dataUrl)) {
      return { images: [], error: 'The attached photo is not a supported JPEG, PNG, WebP, or GIF image.', status: 400 };
    }
    if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      return { images: [], error: 'The attached photo is too large. Crop it or choose a smaller image.', status: 413 };
    }
    totalChars += dataUrl.length;
    if (totalChars > MAX_TOTAL_IMAGE_DATA_URL_CHARS) {
      return { images: [], error: 'The combined attached photos are too large. Send fewer or smaller images.', status: 413 };
    }
    images.push({
      name: String(item.name || 'reef photo').slice(0, 160),
      type: String(item.type || 'image/jpeg').slice(0, 80),
      dataUrl
    });
  }

  if (value.length > 0 && images.length === 0) {
    return { images: [], error: 'No supported image attachment was received.', status: 400 };
  }
  return { images, error: null, status: 200 };
}

function addImagesToLatestUserMessage(messages, images) {
  if (!images.length) return messages;
  const output = messages.map(message => ({ ...message }));
  let latestUserIndex = -1;
  for (let i = output.length - 1; i >= 0; i -= 1) {
    if (output[i].role === 'user') {
      latestUserIndex = i;
      break;
    }
  }
  if (latestUserIndex < 0) return output;

  const text = String(output[latestUserIndex].content || '').slice(0, 12000);
  output[latestUserIndex] = {
    role: 'user',
    content: [
      { type: 'input_text', text },
      ...images.map(image => ({
        type: 'input_image',
        image_url: image.dataUrl,
        detail: 'high'
      }))
    ]
  };
  return output;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (guardPaidAiRequest(req, res, {
    name: 'chat',
    bodyLimitEnv: 'REEF_AI_CHAT_MAX_BODY_BYTES',
    maxBodyBytes: 7_500_000,
    bodyLimitMessage: 'Chat request is too large. Send fewer messages or smaller photos.',
    rateLimitEnv: 'REEF_AI_CHAT_RATE_LIMIT',
    requestsPerWindow: 30
  })) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });
  }

  try {
    const { system, messages, modelMode, attachments } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array.' });
    }

    const supportedMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_CHAT_MESSAGES);
    const reversedMessages = [];
    let remainingTextChars = MAX_CHAT_TEXT_CHARS;
    for (let index = supportedMessages.length - 1; index >= 0 && remainingTextChars > 0; index -= 1) {
      const message = supportedMessages[index];
      const content = message.content.slice(0, Math.min(12_000, remainingTextChars));
      if (!content) continue;
      reversedMessages.push({ role: message.role, content });
      remainingTextChars -= content.length;
    }
    const cleanMessages = reversedMessages.reverse();

    if (cleanMessages.length === 0) {
      return res.status(400).json({ error: 'No supported messages were received.' });
    }

    const normalizedAttachments = normalizeImageAttachments(attachments);
    if (normalizedAttachments.error) {
      return res.status(normalizedAttachments.status).json({ error: normalizedAttachments.error });
    }
    const imageAttachments = normalizedAttachments.images;
    const openaiInput = addImagesToLatestUserMessage(cleanMessages, imageAttachments);

    const modelProfiles = {
      quick: {
        model: process.env.OPENAI_MODEL_QUICK || 'gpt-5.4-mini',
        max_output_tokens: 900,
        style: 'Answer quickly and concisely. Focus on the safest practical next step. Keep it short unless the user asks for detail.'
      },
      balanced: {
        model: process.env.OPENAI_MODEL || 'gpt-5.4',
        max_output_tokens: 1400,
        style: 'Give balanced reef advice with enough explanation to be useful, but avoid overexplaining.'
      },
      deep: {
        model: process.env.OPENAI_MODEL_DEEP || 'gpt-5.5',
        max_output_tokens: 2200,
        style: 'Use deeper reasoning. Explain tradeoffs, risks, likely causes, and a step-by-step plan when appropriate.'
      },
      simple: {
        model: process.env.OPENAI_MODEL_SIMPLE || 'gpt-5.4-nano',
        max_output_tokens: 900,
        style: 'Explain simply in plain language. Avoid jargon unless necessary, and define reef terms briefly.'
      }
    };

    const selectedMode = ['quick', 'balanced', 'deep', 'simple'].includes(modelMode) ? modelMode : 'balanced';
    const selectedProfile = modelProfiles[selectedMode];
    const selectedModel = imageAttachments.length
      ? (process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || selectedProfile.model)
      : selectedProfile.model;

    const imageInstructions = imageAttachments.length ? `

IMAGE REVIEW:
One or more actual images are attached to the latest user message. Inspect the image pixels directly. Do not say that you can only see the filename. Separate visible observations from interpretation, state uncertainty caused by blue reef lighting, glare, blur, angle, obstruction, or limited resolution, and avoid diagnosing disease from an image alone.` : '';

    const reminderInstructions = `

REMINDER DETECTION:
When the user mentions a concrete future reef task, maintenance item, test, dosing check, treatment, water change, equipment replacement, livestock feeding, purchase, follow-up, or recurring husbandry action, suggest a reminder.
Only suggest reminders for actionable items. Do not suggest reminders for casual maybes, vague ideas, or things the user clearly rejects.
Do not say that the reminder was saved. The app will ask the user to approve it.

Return ONLY valid JSON in this exact shape:
{
  "answer": "Normal friendly reef assistant reply as plain text. No markdown tables.",
  "reminders": [
    {
      "title": "Short task title",
      "notes": "Brief practical note",
      "when": "User-friendly timing, such as Today, Tomorrow, This weekend, Mid-June, Every 2 weeks, or 2026-06-15",
      "repeat": "none, daily, weekly, every 2 weeks, monthly, or custom wording",
      "priority": "urgent, soon, or normal",
      "category": "testing, maintenance, feeding, treatment, equipment, livestock, or other",
      "emoji": "One relevant emoji"
    }
  ]
}
If there are no good reminders, return an empty reminders array.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        instructions: `${typeof system === 'string' ? system.slice(0, 50000) : ''}

ANSWER STYLE FOR THIS REQUEST:
${selectedProfile.style}${imageInstructions}${reminderInstructions}`,
        input: openaiInput,
        max_output_tokens: selectedProfile.max_output_tokens
      })
    });

    const data = await openaiResponse.json().catch(() => ({}));

    if (!openaiResponse.ok) {
      const message = data?.error?.message || `OpenAI API error ${openaiResponse.status}`;
      return res.status(openaiResponse.status).json({ error: message });
    }

    const rawText =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap(item => Array.isArray(item.content) ? item.content : [])
            .map(part => part.text || '')
            .join('')
            .trim()
        : '');

    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (innerError) {}
      }
    }

    if (!parsed || typeof parsed.answer !== 'string') {
      return res.status(200).json({ answer: rawText || 'I could not read the AI response.', reminders: [] });
    }

    const reminders = Array.isArray(parsed.reminders)
      ? parsed.reminders
          .filter(r => r && typeof r.title === 'string')
          .slice(0, 3)
          .map(r => ({
            title: String(r.title || '').slice(0, 80),
            notes: String(r.notes || '').slice(0, 240),
            when: String(r.when || '').slice(0, 80),
            repeat: String(r.repeat || 'none').slice(0, 80),
            priority: ['urgent', 'soon', 'normal'].includes(r.priority) ? r.priority : 'normal',
            category: String(r.category || 'other').slice(0, 40),
            emoji: String(r.emoji || '⏰').slice(0, 4)
          }))
      : [];

    return res.status(200).json({ answer: parsed.answer, reminders });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
