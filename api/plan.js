export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
If planContext.resolvedIssues says an issue is resolved/cancelled/completed/lost, treat that as newer and more authoritative than the fixed tank profile. Do not include tasks for resolved, cancelled, completed, or lost issues. In particular, if australianStripyRehomed is resolved, do not include Australian Stripy feeding, sump coverage, rehoming, or posting tasks. If chaetoReactorCancelled is present, do not include chaeto, cheato, refugium, macroalgae, reactor startup, or chaeto harvest tasks. If kfcRecoveryCompleted is present, do not include KFC, cipro/ciprofloxacin, antibiotic recovery dosing, recovery check, skimmer-retry/restart, Microbacter treatment-support, Reef Snow treatment-support, or post-treatment restart tasks unless the user explicitly starts a new treatment. If hammersTorchesLost is present, do not include hammer coral, torch coral, Euphyllia/Fimbriaphyllia, hammer/torch observation, feeding, recovery, placement, or care tasks unless the user explicitly adds new hammer or torch corals later.
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
