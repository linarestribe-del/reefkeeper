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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (guardPaidAiRequest(req, res, {
    name: 'plan',
    bodyLimitEnv: 'REEF_AI_PLAN_MAX_BODY_BYTES',
    maxBodyBytes: 256_000,
    bodyLimitMessage: 'Plan request is too large.',
    rateLimitEnv: 'REEF_AI_PLAN_RATE_LIMIT',
    requestsPerWindow: 8
  })) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });
  }

  try {
    const { system, modelMode, planContext, forceRegenerate } = req.body || {};

    const modelProfiles = {
      quick: {
        model: process.env.OPENAI_MODEL_QUICK || 'gpt-5.4-mini',
        max_output_tokens: 1200
      },
      balanced: {
        model: process.env.OPENAI_MODEL || 'gpt-5.4',
        max_output_tokens: 1800
      },
      deep: {
        model: process.env.OPENAI_MODEL_DEEP || 'gpt-5.5',
        max_output_tokens: 2400
      },
      simple: {
        model: process.env.OPENAI_MODEL_SIMPLE || 'gpt-5.4-nano',
        max_output_tokens: 1200
      }
    };

    const selectedMode = ['quick', 'balanced', 'deep', 'simple'].includes(modelMode) ? modelMode : 'balanced';
    const selectedProfile = modelProfiles[selectedMode];

    const instructions = `${typeof system === 'string' ? system.slice(0, 50000) : ''}

You generate a practical 7-day reef-tank work plan for the user's next days-off block.
Use the user's current recovery goals and recent tank memory. Space tasks out so the user does not stack too many changes on one day.
Prioritize safe reef keeping: avoid aggressive phosphate stripping, avoid kalk dosing while calcium/alk are not ready, retest before major changes, and avoid treating all aiptasia at once.
If a task is already completed recently, do not repeat it unless it is genuinely recurring or needs follow-up.
Include magnesium when testing parameters.
If planContext.resolvedIssues says an issue is resolved/cancelled, treat that as newer and more authoritative than the fixed tank profile. Do not include tasks for resolved or cancelled issues. In particular, if australianStripyRehomed is resolved, do not include Australian Stripy feeding, sump coverage, rehoming, or posting tasks. If chaetoReactorCancelled is present, do not include chaeto, cheato, refugium, macroalgae, reactor startup, or chaeto harvest tasks.
If planContext.activeReefTasks contains active reminders or scheduled reef tasks, integrate the most relevant ones into the 7-day plan and preserve any provided scheduledDay unless there is a strong safety reason to move it. Avoid duplicating the same task in multiple days. Balance the workload across the 7 days by effort and reef-stability risk: avoid stacking water changes, Aiptasia treatment, GFO/carbon changes, and other major interventions on one day.

Return ONLY valid JSON in this exact shape:
{
  "plan": {
    "summary": "One concise sentence explaining the strategy for this block.",
    "days": [
      { "day": 1, "title": "Short day title", "tasks": ["Specific task", "Specific task"] },
      { "day": 2, "title": "Short day title", "tasks": ["Specific task", "Specific task"] },
      { "day": 3, "title": "Short day title", "tasks": ["Specific task", "Specific task"] },
      { "day": 4, "title": "Short day title", "tasks": ["Specific task", "Specific task"] },
      { "day": 5, "title": "Short day title", "tasks": ["Specific task", "Specific task"] },
      { "day": 6, "title": "Short day title", "tasks": ["Specific task", "Specific task"] },
      { "day": 7, "title": "Short day title", "tasks": ["Specific task", "Specific task"] }
    ]
  }
}
Use 1-3 tasks per day. Keep each task under 140 characters. Do not include markdown.`;

    const input = [{
      role: 'user',
      content: `Build ${forceRegenerate ? 'a regenerated' : 'an'} AI days-off plan for this reef tank block. Context JSON:\n${JSON.stringify(planContext || {}, null, 2).slice(0, 18000)}`
    }];

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedProfile.model,
        instructions,
        input,
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

    const plan = parsed?.plan;
    if (!plan || !Array.isArray(plan.days)) {
      return res.status(502).json({ error: 'The AI did not return a usable days-off plan.' });
    }

    const cleanPlan = {
      summary: String(plan.summary || 'Custom plan for this days-off block.').slice(0, 260),
      days: plan.days.slice(0, 7).map((day, idx) => ({
        day: Number(day.day) || idx + 1,
        title: String(day.title || `Day ${idx + 1}`).slice(0, 70),
        tasks: Array.isArray(day.tasks)
          ? day.tasks.map(t => String(t || '').trim()).filter(Boolean).slice(0, 3).map(t => t.slice(0, 140))
          : []
      })).filter(day => day.tasks.length)
    };

    return res.status(200).json({ plan: cleanPlan });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
