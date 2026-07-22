import { createHash, timingSafeEqual } from 'node:crypto';

// Reef Keeper Maintenance 5C — durable shared-key access control for paid AI endpoints.
// The access layer is staged: endpoints remain available until REEF_AI_ACCESS_KEY (or
// REEF_AI_ACCESS_KEYS) is configured in Vercel. Once configured, every paid AI POST
// must present the same key in X-Reef-AI-Access-Key or Authorization: Bearer.
const REEF_AI_ACCESS_HEADER = 'x-reef-ai-access-key';

function aiConfiguredAccessKeys() {
  const raw = [process.env.REEF_AI_ACCESS_KEY, process.env.REEF_AI_ACCESS_KEYS]
    .filter(value => typeof value === 'string' && value.trim())
    .join('\n');
  return [...new Set(raw.split(/[\n,]+/).map(value => value.trim()).filter(Boolean).slice(0, 8))];
}

function aiPresentedAccessKey(req) {
  const direct = aiHeader(req, REEF_AI_ACCESS_HEADER).trim();
  if (direct) return direct.slice(0, 512);
  const authorization = aiHeader(req, 'authorization').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim().slice(0, 512) : '';
}

function aiAccessKeyMatches(presented, configured) {
  if (!presented || !configured) return false;
  const presentedHash = createHash('sha256').update(presented, 'utf8').digest();
  const configuredHash = createHash('sha256').update(configured, 'utf8').digest();
  return timingSafeEqual(presentedHash, configuredHash);
}

function enforcePaidAiAccess(req, res) {
  const configuredKeys = aiConfiguredAccessKeys();
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  res.setHeader?.('Vary', 'X-Reef-AI-Access-Key, Authorization');

  // Staged deployment safety: adding the code does not interrupt the app. Protection
  // becomes mandatory only after an access key is configured in Vercel.
  if (configuredKeys.length === 0) {
    res.setHeader?.('X-Reef-AI-Access', 'not-configured');
    return false;
  }

  const presented = aiPresentedAccessKey(req);
  const accepted = configuredKeys.some(configured => aiAccessKeyMatches(presented, configured));
  if (accepted) {
    res.setHeader?.('X-Reef-AI-Access', 'accepted');
    return false;
  }

  res.setHeader?.('X-Reef-AI-Access', 'denied');
  res.status(401).json({
    error: 'AI access key required. Open Settings → AI and enter the Reef Keeper access key.',
    code: 'REEF_AI_ACCESS_REQUIRED'
  });
  return true;
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (enforcePaidAiAccess(req, res)) return;
  if (guardPaidAiRequest(req, res, {
    name: 'livestock',
    bodyLimitEnv: 'REEF_AI_LIVESTOCK_MAX_BODY_BYTES',
    maxBodyBytes: 16_384,
    bodyLimitMessage: 'Livestock lookup request is too large.',
    rateLimitEnv: 'REEF_AI_LIVESTOCK_RATE_LIMIT',
    requestsPerWindow: 20
  })) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });
  try {
    const { commonName } = req.body || {};
    const name = String(commonName || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Missing commonName.' });
    const model = process.env.OPENAI_MODEL || 'gpt-5.4';
    const prompt = `Fill a reef aquarium livestock/coral inventory profile for the common name: ${name}. Return ONLY valid JSON with this shape: {"commonName":"","scientificName":"","type":"fish|coral|invert|anemone|other","naturalRange":"","facts":["3 to 5 short bullet facts about temperament, diet, care, compatibility, or habitat"],"notes":"Short practical tank-keeper note"}. If the exact species is uncertain, include "verify" in the scientificName. Do not include URLs. Do not invent that this animal is definitely in the user's tank beyond the common name.`;
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions:'You create concise reef aquarium field-guide entries. Accuracy matters. Return strict JSON only.',
        input:[{ role:'user', content: prompt }],
        max_output_tokens: 900
      })
    });
    const data = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) return res.status(openaiResponse.status).json({ error: data?.error?.message || 'OpenAI API error' });
    const raw = data.output_text || (Array.isArray(data.output) ? data.output.flatMap(i => Array.isArray(i.content) ? i.content : []).map(p => p.text || '').join('').trim() : '');
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch(e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]); else throw e;
    }
    const allowedTypes = new Set(['fish','coral','invert','anemone','other']);
    const result = {
      commonName: String(parsed.commonName || name).slice(0, 120),
      scientificName: String(parsed.scientificName || '').slice(0, 160),
      type: allowedTypes.has(parsed.type) ? parsed.type : 'other',
      naturalRange: String(parsed.naturalRange || '').slice(0, 220),
      facts: Array.isArray(parsed.facts) ? parsed.facts.map(f => String(f).slice(0, 160)).filter(Boolean).slice(0, 5) : [],
      notes: String(parsed.notes || '').slice(0, 240)
    };
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
