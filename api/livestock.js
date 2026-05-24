export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
