// Reef Keeper Build 2J — same-origin delivery for current and selected historical images

import { Readable } from 'node:stream';
import { normalizeObserverSlot, normalizeObserverTimelapseSlot } from '../lib/observer-common.js';
import { readObserverImage, readObserverTimelapse } from '../lib/observer-blob.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  if (String(req.query?.media || '') === 'timelapse') {
    const timelapseSlot = normalizeObserverTimelapseSlot(req.query?.slot);
    if (!timelapseSlot) return res.status(400).send('Unknown Observer timelapse slot');
    try {
      const result = await readObserverTimelapse(timelapseSlot);
      if (!result || result.statusCode !== 200 || !result.stream) return res.status(404).send('Observer timelapse not found');
      const size = Number(result.blob?.size || 0);
      res.setHeader('Content-Type', result.blob?.contentType || 'video/mp4');
      res.setHeader('Content-Disposition', `inline; filename="aquarium-observer-${timelapseSlot}.mp4"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('Accept-Ranges', 'bytes');
      if (result.blob?.etag) res.setHeader('ETag', result.blob.etag);
      if (req.method === 'HEAD') {
        if (size) res.setHeader('Content-Length', String(size));
        return res.status(200).end();
      }
      const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
      const range = String(req.headers?.range || '');
      if (range) {
        const match = range.match(/^bytes=(\d*)-(\d*)$/);
        if (!match) {
          res.setHeader('Content-Range', `bytes */${buffer.length}`);
          return res.status(416).end();
        }
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : buffer.length - 1;
        if (!match[1] && match[2]) {
          const suffix = Number(match[2]);
          start = Math.max(0, buffer.length - suffix);
          end = buffer.length - 1;
        }
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= buffer.length) {
          res.setHeader('Content-Range', `bytes */${buffer.length}`);
          return res.status(416).end();
        }
        end = Math.min(end, buffer.length - 1);
        const chunk = buffer.subarray(start, end + 1);
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
        res.setHeader('Content-Length', String(chunk.length));
        return res.end(chunk);
      }
      res.setHeader('Content-Length', String(buffer.length));
      return res.status(200).end(buffer);
    } catch (error) {
      console.error('Observer timelapse delivery error', error);
      return res.status(503).send('Observer timelapse unavailable');
    }
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
