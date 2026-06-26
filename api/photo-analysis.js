export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable in Vercel.' });

  try {
    const { item, image, previousAnalyses, tankSummary } = req.body || {};
    if (!image || typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Missing supported image data.' });
    }
    if (image.dataUrl.length > 6_000_000) {
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
            { type: 'input_image', image_url: image.dataUrl }
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
