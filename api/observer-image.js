// Reef Keeper Build 2J — same-origin delivery for current and selected historical images

import { Readable } from 'node:stream';
import { normalizeObserverSlot } from '../lib/observer-common.js';
import { readObserverImage } from '../lib/observer-blob.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  const slot = normalizeObserverSlot(req.query?.slot || 'latest');
  if (!slot) return res.status(400).send('Unknown Observer image slot');

  try {
    const result = await readObserverImage(slot);
    if (!result || result.statusCode !== 200 || !result.stream) return res.status(404).send('Observer image not found');

    res.setHeader('Content-Type', result.blob.contentType || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="aquarium-observer-${slot}.jpg"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (result.blob.size != null) res.setHeader('Content-Length', String(result.blob.size));
    if (result.blob.etag) res.setHeader('ETag', result.blob.etag);

    if (req.method === 'HEAD') return res.status(200).end();
    Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    console.error('Observer image delivery error', error);
    return res.status(503).send('Observer image unavailable');
  }
}
