export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });
  }

  try {
    const { system, messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array.' });
    }

    const cleanMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({
        role: m.role,
        content: m.content.slice(0, 12000)
      }));

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        instructions: typeof system === 'string' ? system.slice(0, 20000) : undefined,
        input: cleanMessages,
        max_output_tokens: 1000
      })
    });

    const data = await openaiResponse.json().catch(() => ({}));

    if (!openaiResponse.ok) {
      const message = data?.error?.message || `OpenAI API error ${openaiResponse.status}`;
      return res.status(openaiResponse.status).json({ error: message });
    }

    const answer =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap(item => Array.isArray(item.content) ? item.content : [])
            .map(part => part.text || '')
            .join('')
            .trim()
        : '');

    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
