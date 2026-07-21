// Reef Keeper Build 2L — authenticated weekly/monthly timelapse metadata and upload endpoint

import {
  decodeObserverMp4,
  expectedObserverWriteToken,
  normalizeObserverTimelapseFeed,
  normalizeObserverTimelapseSlot,
  observerIso,
  observerNumber,
  cleanObserverString,
  parseObserverBody,
  readBearer,
  secureTokenMatch,
  setObserverHeaders
} from '../lib/observer-common.js';
import {
  readObserverTimelapseFeed,
  writeObserverTimelapse,
  writeObserverTimelapseFeed
} from '../lib/observer-blob.js';

function awaitingFeed() {
  return normalizeObserverTimelapseFeed({
    ok: true,
    timelapses: {
      week: { available: false, state: 'waiting_for_history', label: 'Rolling 7 days' },
      month: { available: false, state: 'waiting_for_history', label: 'Rolling 30 days' }
    }
  });
}

export default async function handler(req, res) {
  setObserverHeaders(res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const stored = await readObserverTimelapseFeed().catch(() => null);
      return res.status(200).json(stored ? normalizeObserverTimelapseFeed(stored) : awaitingFeed());
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const expected = expectedObserverWriteToken();
    if (!expected) return res.status(500).json({ ok: false, error: 'Server missing Observer write token.' });
    if (!secureTokenMatch(readBearer(req), expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const body = parseObserverBody(req);
    const slot = normalizeObserverTimelapseSlot(body.slot);
    if (!slot) return res.status(400).json({ ok: false, error: 'Timelapse slot must be week or month.' });
    const generatedAt = observerIso(body.generatedAt);
    const startCapturedAt = observerIso(body.startCapturedAt);
    const endCapturedAt = observerIso(body.endCapturedAt);
    if (!generatedAt || !startCapturedAt || !endCapturedAt) {
      return res.status(400).json({ ok: false, error: 'Timelapse metadata requires generatedAt, startCapturedAt, and endCapturedAt.' });
    }
    const video = decodeObserverMp4(body.videoBase64);
    const blob = await writeObserverTimelapse(video, slot);
    const existing = await readObserverTimelapseFeed().catch(() => null);
    const normalizedExisting = normalizeObserverTimelapseFeed(existing || {});
    const updatedAt = new Date().toISOString();
    const record = {
      slot,
      available: true,
      state: 'ready',
      label: slot === 'month' ? 'Rolling 30 days' : 'Rolling 7 days',
      generatedAt,
      startCapturedAt,
      endCapturedAt,
      frameCount: Math.max(1, Math.floor(observerNumber(body.frameCount) || 1)),
      durationSeconds: Math.max(0.1, observerNumber(body.durationSeconds) || 0.1),
      sizeBytes: video.length,
      coverageDays: Math.max(0, observerNumber(body.coverageDays) || 0),
      fps: Math.max(1, Math.min(60, observerNumber(body.fps) || 12)),
      resolution: cleanObserverString(body.resolution || '640×360', 40),
      videoVersion: blob.etag || generatedAt
    };
    const feed = normalizeObserverTimelapseFeed({
      ok: true,
      updatedAt,
      timelapses: {
        week: slot === 'week' ? record : normalizedExisting.timelapses.week,
        month: slot === 'month' ? record : normalizedExisting.timelapses.month
      }
    });
    await writeObserverTimelapseFeed(feed);
    return res.status(200).json({
      ok: true,
      durable: true,
      slot,
      generatedAt,
      sizeBytes: video.length,
      updatedAt
    });
  } catch (error) {
    const message = error?.message || 'Observer timelapse endpoint error.';
    const validationError = /videoBase64|MP4|timelapse|slot|generatedAt|startCapturedAt|endCapturedAt|exceeds|Base64/i.test(message);
    if (!validationError) console.error('Observer timelapse storage error', error);
    return res.status(validationError ? 400 : 503).json({ ok: false, error: validationError ? message : 'Observer timelapse storage is unavailable.' });
  }
}
