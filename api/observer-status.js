// Reef Keeper Maintenance 8D — dual-camera Observer status and health bridge backed by private Cloudflare R2

import {
  awaitingObserverStatus,
  expectedObserverWriteToken,
  normalizeObserverStatus,
  normalizeObserverCameraStatus,
  normalizeObserverCameraId,
  normalizeObserverTimelapseFeed,
  parseObserverBody,
  readBearer,
  secureTokenMatch,
  setObserverHeaders
} from '../lib/observer-common.js';
import { readObserverStatus, writeObserverStatus, readObserverTimelapseFeed } from '../lib/observer-r2.js';

function awaitingTimelapseFeed() {
  const waiting = {
    week: { available: false, state: 'waiting_for_history', label: 'Rolling 7 days' },
    month: { available: false, state: 'waiting_for_history', label: 'Rolling 30 days' }
  };
  return normalizeObserverTimelapseFeed({
    ok: true,
    timelapses: waiting,
    cameras: {
      overview: { timelapses: waiting },
      return: { timelapses: waiting }
    }
  });
}

export default async function handler(req, res) {
  setObserverHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const expected = expectedObserverWriteToken();
      if (!expected) return res.status(500).json({ ok: false, error: 'Server missing Observer write token.' });
      if (!secureTokenMatch(readBearer(req), expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

      // Compatibility path for metadata-only health updates. Image bytes belong on
      // /api/observer-publish and are deliberately rejected here.
      const body = parseObserverBody(req);
      const cameraId = normalizeObserverCameraId(req.query?.camera || body.cameraId || 'overview');
      if (!cameraId) return res.status(400).json({ ok: false, error: 'Unknown Observer camera.' });
      if (body.imageDataUrl || body.imageBase64 || body.imageBytes || body.thumbnailDataUrl) {
        return res.status(400).json({ ok: false, error: 'Image bytes are accepted only by /api/observer-publish.' });
      }
      const existing = await readObserverStatus().catch(() => null);
      if (cameraId === 'return') {
        const cameraRecord = normalizeObserverCameraStatus('return', body, {
          ok: body.ok ?? existing?.cameras?.return?.ok ?? false,
          capturedAt: body.capturedAt || body.captured_at || existing?.cameras?.return?.capturedAt,
          publishedAt: body.publishedAt || existing?.cameras?.return?.publishedAt,
          imageAvailable: existing?.cameras?.return?.imageAvailable === true,
          imageVersion: existing?.cameras?.return?.imageVersion || '',
          sizeBytes: existing?.cameras?.return?.sizeBytes || 0,
          health: body.health || existing?.cameras?.return?.health
        });
        const record = existing ? normalizeObserverStatus(existing, {
          ok: existing.ok,
          capturedAt: existing.capturedAt,
          publishedAt: existing.publishedAt,
          imageAvailable: existing.imageAvailable === true,
          imageVersion: existing.imageVersion,
          sizeBytes: existing.sizeBytes,
          comparisons: existing.comparisons,
          health: existing.health
        }) : normalizeObserverStatus({ configured: false, ok: false });
        record.cameras = { ...(record.cameras || {}), return: cameraRecord };
        record.receivedAt = new Date().toISOString();
        await writeObserverStatus(record);
        return res.status(200).json({ ok: true, durable: true, cameraId: 'return', receivedAt: record.receivedAt, healthStatus: cameraRecord.health?.status || 'pending' });
      }

      const merged = {
        ...(existing || {}),
        ...body,
        storage: { ...(existing?.storage || {}), ...(body.storage || {}) },
        health: body.health || existing?.health,
        comparisons: existing?.comparisons || body.comparisons,
        cameras: { ...(existing?.cameras || {}), overview: { ...(existing?.cameras?.overview || {}), ...body } }
      };
      const record = normalizeObserverStatus(merged, {
        ok: body.ok ?? existing?.ok ?? false,
        capturedAt: body.capturedAt || body.captured_at || existing?.capturedAt,
        imageAvailable: existing?.imageAvailable === true,
        imageVersion: existing?.imageVersion || '',
        sizeBytes: existing?.sizeBytes || 0,
        comparisons: existing?.comparisons || body.comparisons,
        health: body.health || existing?.health
      });
      await writeObserverStatus(record);
      return res.status(200).json({ ok: true, durable: true, cameraId: 'overview', receivedAt: record.receivedAt, healthStatus: record.health?.status || 'pending' });
    }

    if (req.method === 'GET') {
      if (String(req.query?.resource || '') === 'timelapses') {
        const stored = await readObserverTimelapseFeed().catch(() => null);
        return res.status(200).json(stored ? normalizeObserverTimelapseFeed(stored) : awaitingTimelapseFeed());
      }
      const record = await readObserverStatus();
      return res.status(200).json(record || awaitingObserverStatus());
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    if (req.method === 'GET') {
      return res.status(200).json(awaitingObserverStatus('Observer storage is not connected or is temporarily unavailable.'));
    }
    return res.status(503).json({ ok: false, configured: true, error: error?.message || 'Observer endpoint error.' });
  }
}
