export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });
  }

  try {
    const { system, messages, modelMode } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array.' });
    }

    const cleanMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({
        role: m.role,
        content: m.content.slice(0, 12000)
      }));

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
        model: selectedProfile.model,
        instructions: `${typeof system === 'string' ? system.slice(0, 20000) : ''}

ANSWER STYLE FOR THIS REQUEST:
${selectedProfile.style}${reminderInstructions}`,
        input: cleanMessages,
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
