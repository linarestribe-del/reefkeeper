// Reef Keeper Build 2J — authenticated automatic daily visual comparison and public read endpoint

import {
  cleanObserverString,
  decodeObserverDailyImages,
  expectedObserverWriteToken,
  normalizeObserverDailySummary,
  parseObserverBody,
  readBearer,
  secureTokenMatch,
  setObserverHeaders
} from '../lib/observer-common.js';
import {
  readObserverDailySummary,
  writeObserverDailySummary,
  writeObserverImage
} from '../lib/observer-blob.js';

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  if (!Array.isArray(data?.output)) return '';
  return data.output
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .map(part => part?.text || '')
    .join('')
    .trim();
}

function parseJsonObject(text) {
  try { return JSON.parse(text); } catch (_) {}
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

function dailyPrompt(previous, current) {
  return [
    `Image 1 is the representative sump-camera frame from ${previous.capturedAt}.`,
    `Image 2 is the representative sump-camera frame from ${current.capturedAt}.`,
    'Compare them in chronological order and create a concise daily visual report.',
    'First determine whether lighting, infrared/night vision, glare, framing, blur, obstruction, reflections, or camera movement make the comparison unreliable.',
    'Describe only changes visibly supported by both frames. Check water level, skimmer foam/cup condition, filter roller position, visible plumbing or tubing, equipment position, salt creep, condensation, algae/biofilm, debris, microbubbles, cloudiness, and visible leak/overflow evidence—but only where shown.',
    'Do not infer pump operation, flow rate, water chemistry, hidden leaks, or livestock condition outside the camera view.',
    'Use status stable when no meaningful concerning change is visible; watch when a possible change deserves verification; attention only for a clearly visible concern; unavailable when image quality prevents a useful comparison.',
    'Return JSON only with: status, headline, summary, visibleChanges (array), concerns (array), nextChecks (array, maximum 2), and uncertainty.'
  ].join('\n\n');
}

async function generateDailySummary(images) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY environment variable in Vercel.');
  const previous = images.find(item => item.slot === 'dailyPrevious');
  const current = images.find(item => item.slot === 'dailyCurrent');
  const model = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || 'gpt-5.4';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: 'You are Reef Keeper Aquarium Observer. Produce careful evidence-limited sump-camera comparisons. Return valid JSON only and never claim certainty beyond the images.',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: dailyPrompt(previous, current) },
          { type: 'input_image', image_url: `data:image/jpeg;base64,${previous.image.toString('base64')}`, detail: 'high' },
          { type: 'input_image', image_url: `data:image/jpeg;base64,${current.image.toString('base64')}`, detail: 'high' }
        ]
      }],
      max_output_tokens: 900
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI API error ${response.status}`);
  const parsed = parseJsonObject(extractResponseText(data));
  if (!parsed) throw new Error('The daily visual report was not returned as valid JSON.');
  return { parsed, previous, current, model };
}

export default async function handler(req, res) {
  setObserverHeaders(res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      const existing = await readObserverDailySummary();
      const normalized = normalizeObserverDailySummary(existing || {
        ok: false,
        state: 'awaiting_daily_summary',
        message: 'The Pi will generate today’s visual summary after the daily representative capture time and once a prior-day frame is available.'
      });
      return res.status(200).json(normalized);
    } catch (error) {
      return res.status(200).json(normalizeObserverDailySummary({
        ok: false,
        state: 'temporarily_unavailable',
        message: 'The saved daily visual summary is temporarily unavailable.'
      }));
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const expected = expectedObserverWriteToken();
  if (!expected) return res.status(500).json({ ok: false, error: 'Server missing Observer write token.' });
  if (!secureTokenMatch(readBearer(req), expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const body = parseObserverBody(req);
    const images = decodeObserverDailyImages(body.dailyImages);
    const previous = images.find(item => item.slot === 'dailyPrevious');
    const current = images.find(item => item.slot === 'dailyCurrent');
    if (new Date(previous.capturedAt).getTime() >= new Date(current.capturedAt).getTime()) {
      return res.status(400).json({ ok: false, error: 'dailyPrevious must be older than dailyCurrent.' });
    }

    const existing = await readObserverDailySummary().catch(() => null);
    const existingNormalized = normalizeObserverDailySummary(existing || {});
    if (body.force !== true && existingNormalized.ok && existingNormalized.source.currentCapturedAt === current.capturedAt) {
      return res.status(200).json({ ...existingNormalized, reused: true });
    }

    await Promise.all(images.map(item => writeObserverImage(item.image, item.slot)));
    const generated = await generateDailySummary(images);
    const raw = generated.parsed || {};
    const record = normalizeObserverDailySummary({
      ok: true,
      status: cleanObserverString(raw.status || 'watch', 20).toLowerCase(),
      generatedAt: new Date().toISOString(),
      headline: raw.headline,
      summary: raw.summary,
      visibleChanges: raw.visibleChanges,
      concerns: raw.concerns,
      nextChecks: raw.nextChecks,
      uncertainty: raw.uncertainty,
      source: {
        currentCapturedAt: current.capturedAt,
        previousCapturedAt: previous.capturedAt
      },
      model: generated.model
    });
    await writeObserverDailySummary(record);
    return res.status(200).json({ ...record, reused: false });
  } catch (error) {
    const message = error?.message || 'Daily visual summary generation failed.';
    const validation = /dailyImages|Daily image|requires both|JPEG|Base64|capturedAt|older than/i.test(message);
    if (!validation) console.error('Observer daily summary error', error);
    return res.status(validation ? 400 : 503).json({ ok: false, error: validation ? message : 'Daily visual summary generation failed.' });
  }
}
