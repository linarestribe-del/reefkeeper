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

const SUPPORTED_PHOTO_DATA_URL = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[a-z0-9+/=\r\n]+$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (guardPaidAiRequest(req, res, {
    name: 'photo-analysis',
    bodyLimitEnv: 'REEF_AI_PHOTO_MAX_BODY_BYTES',
    maxBodyBytes: 6_400_000,
    bodyLimitMessage: 'Photo-analysis request is too large. Try a smaller or cropped image.',
    rateLimitEnv: 'REEF_AI_PHOTO_RATE_LIMIT',
    requestsPerWindow: 12
  })) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });

  try {
    const { item, image, previousAnalyses, tankSummary } = req.body || {};
    const imageDataUrl = image && typeof image.dataUrl === 'string' ? image.dataUrl.trim() : '';
    if (!SUPPORTED_PHOTO_DATA_URL.test(imageDataUrl)) {
      return res.status(400).json({ error: 'Missing supported JPEG, PNG, WebP, or GIF image data.' });
    }
    if (imageDataUrl.length > 6_000_000) {
      return res.status(413).json({ error: 'Photo is too large. Try a smaller or cropped image.' });
    }

    const model = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || 'gpt-5.4';
    const context = {
      inventoryItem: item && typeof item === 'object' ? item : {},
      previousAnalyses: Array.isArray(previousAnalyses) ? previousAnalyses.slice(0, 8) : [],
      tankSummary: String(tankSummary || '').slice(0, 6000)
    };

    const prompt = `Analyze this reef aquarium livestock photo for catalog use. Identify the visible livestock if possible, assess visible health, and if it appears to be coral, comment on growth or regression using prior analysis context when available. Be conservative: report uncertainty caused by blue lighting, blur, partial view, obstruction, or similar-looking species. Return ONLY valid JSON with this exact shape:
{
  "suggestedId": "common-name level ID or uncertain",
  "confidence": "high|medium|low",
  "category": "fish|coral|invert|anemone|other",
  "healthStatus": "healthy|watch|stressed|recovering|uncertain",
  "visibleSigns": ["short visible observation"],
  "healthConcerns": ["short concern or empty if none visible"],
  "growthAssessment": "short growth/color/polyp-extension/tissue assessment, especially for coral",
  "estimatedGrowthPercent": "conservative rough percent change vs prior photo, or unknown",
  "bodyCondition": "fish body condition / coral extension summary, or unknown",
  "timelineComparison": "what changed compared with prior analyses, or insufficient history",
  "recommendedActions": ["safe practical next step"],
  "trackingNotes": "one concise note suitable for a growth/health timeline",
  "saveSuggestion": "new livestock entry|update existing item|growth progress photo|health concern log|do not save"
}
Context JSON:
${JSON.stringify(context, null, 2).slice(0, 9000)}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions: 'You are a reef aquarium visual-analysis assistant. You inspect aquarium photos and return strict JSON only. You do not overstate certainty or diagnose disease from a photo alone.',
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageDataUrl }
          ]
        }],
        max_output_tokens: 1200
      })
    });

    const data = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) return res.status(openaiResponse.status).json({ error: data?.error?.message || 'OpenAI API error' });

    const raw = data.output_text || (Array.isArray(data.output)
      ? data.output.flatMap(i => Array.isArray(i.content) ? i.content : []).map(p => p.text || '').join('').trim()
      : '');

    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch(e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }
    if (!parsed || typeof parsed !== 'object') return res.status(502).json({ error: 'AI did not return usable photo analysis.' });

    const allowedCategories = new Set(['fish','coral','invert','anemone','other']);
    const allowedHealth = new Set(['healthy','watch','stressed','recovering','uncertain']);
    const allowedConfidence = new Set(['high','medium','low']);
    const cleanArray = value => Array.isArray(value) ? value.map(x => String(x || '').trim()).filter(Boolean).slice(0, 6).map(x => x.slice(0, 180)) : [];

    return res.status(200).json({
      suggestedId: String(parsed.suggestedId || 'uncertain').slice(0, 120),
      confidence: allowedConfidence.has(parsed.confidence) ? parsed.confidence : 'low',
      category: allowedCategories.has(parsed.category) ? parsed.category : 'other',
      healthStatus: allowedHealth.has(parsed.healthStatus) ? parsed.healthStatus : 'uncertain',
      visibleSigns: cleanArray(parsed.visibleSigns),
      healthConcerns: cleanArray(parsed.healthConcerns),
      growthAssessment: String(parsed.growthAssessment || '').slice(0, 500),
      estimatedGrowthPercent: String(parsed.estimatedGrowthPercent || 'unknown').slice(0, 80),
      bodyCondition: String(parsed.bodyCondition || 'unknown').slice(0, 240),
      timelineComparison: String(parsed.timelineComparison || 'insufficient history').slice(0, 500),
      recommendedActions: cleanArray(parsed.recommendedActions),
      trackingNotes: String(parsed.trackingNotes || '').slice(0, 500),
      saveSuggestion: String(parsed.saveSuggestion || 'growth progress photo').slice(0, 80)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
