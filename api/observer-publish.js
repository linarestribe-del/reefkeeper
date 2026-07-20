// Reef Keeper Build 2F — authenticated Raspberry Pi image and status publisher

import {
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
    const image = decodeObserverJpeg(body.imageBase64);
    const publishedAt = new Date().toISOString();
    const imageBlob = await writeObserverImage(image);

    // Only selected, sanitized fields are persisted. Camera credentials, RTSP URLs,
    // local file paths, and home-network addresses are never copied into Vercel storage.
    const record = normalizeObserverStatus(body, {
      ok: body.ok !== false,
      imageAvailable: true,
      imageVersion: body.capturedAt || body.captured_at || imageBlob.etag || publishedAt,
      publishedAt,
      sizeBytes: image.length
    });
    await writeObserverStatus(record);

    return res.status(200).json({
      ok: true,
      durable: true,
      publishedAt: record.publishedAt,
      capturedAt: record.capturedAt,
      sizeBytes: record.sizeBytes
    });
  } catch (error) {
    const message = error?.message || 'Observer publish failed.';
    const validationError = /Missing imageBase64|Base64|JPEG|exceeds|padding|empty/i.test(message);
    if (!validationError) console.error('Observer publish storage error', error);
    return res.status(validationError ? 400 : 503).json({
      ok: false,
      error: validationError ? message : 'Observer storage upload failed.'
    });
  }
}
