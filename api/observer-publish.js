// Reef Keeper Build 2J — authenticated Observer image, history, and health publisher

import {
  decodeObserverHistoryImages,
  decodeObserverJpeg,
  expectedObserverWriteToken,
  normalizeObserverStatus,
  parseObserverBody,
  readBearer,
  secureTokenMatch,
  setObserverHeaders
} from '../lib/observer-common.js';
import { writeObserverImage, writeObserverStatus } from '../lib/observer-blob.js';

export default async function handler(req, res) {
  setObserverHeaders(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const expected = expectedObserverWriteToken();
  if (!expected) return res.status(500).json({ ok: false, error: 'Server missing Observer write token.' });
  if (!secureTokenMatch(readBearer(req), expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const body = parseObserverBody(req);
    const latestImage = decodeObserverJpeg(body.imageBase64);
    const historyImages = decodeObserverHistoryImages(body.historyImages);
    const publishedAt = new Date().toISOString();
    const latestBlob = await writeObserverImage(latestImage, 'latest');

    const comparisons = {};
    for (const history of historyImages) {
      const blob = await writeObserverImage(history.image, history.slot);
      comparisons[history.slot] = {
        available: true,
        capturedAt: history.capturedAt,
        sizeBytes: history.image.length,
        imageVersion: blob.etag || history.capturedAt
      };
    }

    const record = normalizeObserverStatus(body, {
      ok: body.ok !== false,
      imageAvailable: true,
      imageVersion: body.capturedAt || body.captured_at || latestBlob.etag || publishedAt,
      publishedAt,
      sizeBytes: latestImage.length,
      comparisons
    });
    await writeObserverStatus(record);

    return res.status(200).json({
      ok: true,
      durable: true,
      publishedAt: record.publishedAt,
      capturedAt: record.capturedAt,
      sizeBytes: record.sizeBytes,
      historySlots: historyImages.map(item => item.slot),
      healthStatus: record.health?.status || 'pending'
    });
  } catch (error) {
    const message = error?.message || 'Observer publish failed.';
    const validationError = /Missing imageBase64|Base64|JPEG|exceeds|padding|empty|historyImages|History image|slot|capturedAt/i.test(message);
    if (!validationError) console.error('Observer publish storage error', error);
    return res.status(validationError ? 400 : 503).json({
      ok: false,
      error: validationError ? message : 'Observer storage upload failed.'
    });
  }
}
