// Reef Keeper Build 2F — Aquarium Observer status bridge backed by private Vercel Blob

import {
  awaitingObserverStatus,
  expectedObserverWriteToken,
  normalizeObserverStatus,
  parseObserverBody,
  readBearer,
  secureTokenMatch,
  setObserverHeaders
} from '../lib/observer-common.js';
import { readObserverStatus, writeObserverStatus } from '../lib/observer-blob.js';

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
      if (body.imageDataUrl || body.imageBase64 || body.imageBytes || body.thumbnailDataUrl) {
        return res.status(400).json({ ok: false, error: 'Image bytes are accepted only by /api/observer-publish.' });
      }
      const record = normalizeObserverStatus(body, { imageAvailable: false });
      await writeObserverStatus(record);
      return res.status(200).json({ ok: true, durable: true, receivedAt: record.receivedAt });
    }

    if (req.method === 'GET') {
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
