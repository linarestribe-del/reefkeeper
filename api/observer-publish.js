// Reef Keeper Maintenance 8D — authenticated dual-camera Observer publisher

import {
  decodeObserverHistoryImages,
  decodeObserverJpeg,
  decodeObserverMp4,
  expectedObserverWriteToken,
  normalizeObserverStatus,
  normalizeObserverCameraStatus,
  normalizeObserverCameraId,
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
  writeObserverImage,
  writeObserverCameraImage,
  writeObserverStatus,
  readObserverStatus,
  readObserverTimelapseFeed,
  writeObserverTimelapse,
  writeObserverTimelapseFeed
} from '../lib/observer-r2.js';

export default async function handler(req, res) {
  setObserverHeaders(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const expected = expectedObserverWriteToken();
  if (!expected) return res.status(500).json({ ok: false, error: 'Server missing Observer write token.' });
  if (!secureTokenMatch(readBearer(req), expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const body = parseObserverBody(req);
    const cameraId = normalizeObserverCameraId(req.query?.camera || body.cameraId || 'overview');
    if (!cameraId) return res.status(400).json({ ok: false, error: 'Unknown Observer camera.' });

    if (String(req.query?.resource || '') === 'timelapse') {
      const slot = normalizeObserverTimelapseSlot(body.slot);
      if (!slot) return res.status(400).json({ ok: false, error: 'Timelapse slot must be week or month.' });
      const generatedAt = observerIso(body.generatedAt);
      const startCapturedAt = observerIso(body.startCapturedAt);
      const endCapturedAt = observerIso(body.endCapturedAt);
      if (!generatedAt || !startCapturedAt || !endCapturedAt) {
        return res.status(400).json({ ok: false, error: 'Timelapse metadata requires generatedAt, startCapturedAt, and endCapturedAt.' });
      }
      const video = decodeObserverMp4(body.videoBase64);
      const blob = await writeObserverTimelapse(video, slot, cameraId);
      const existing = await readObserverTimelapseFeed().catch(() => null);
      const normalizedExisting = normalizeObserverTimelapseFeed(existing || {});
      const updatedAt = new Date().toISOString();
      const record = {
        slot,
        cameraId,
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
      const overviewTimelapses = {
        week: normalizedExisting.timelapses.week,
        month: normalizedExisting.timelapses.month
      };
      const returnTimelapses = {
        week: normalizedExisting.cameras?.return?.timelapses?.week,
        month: normalizedExisting.cameras?.return?.timelapses?.month
      };
      const targetTimelapses = cameraId === 'return' ? returnTimelapses : overviewTimelapses;
      targetTimelapses[slot] = record;
      const feed = normalizeObserverTimelapseFeed({
        ok: true,
        updatedAt,
        timelapses: overviewTimelapses,
        cameras: {
          overview: { timelapses: overviewTimelapses },
          return: { timelapses: returnTimelapses }
        }
      });
      await writeObserverTimelapseFeed(feed);
      return res.status(200).json({ ok: true, durable: true, cameraId, slot, generatedAt, sizeBytes: video.length, updatedAt });
    }

    if (cameraId === 'return') {
      const latestImage = decodeObserverJpeg(body.imageBase64);
      const publishedAt = new Date().toISOString();
      const latestObject = await writeObserverCameraImage(latestImage, 'return', 'latest');
      const cameraRecord = normalizeObserverCameraStatus('return', body, {
        ok: body.ok !== false,
        capturedAt: body.capturedAt || body.captured_at,
        imageAvailable: true,
        imageVersion: body.capturedAt || body.captured_at || latestObject.etag || publishedAt,
        publishedAt,
        sizeBytes: latestImage.length,
        health: body.health
      });
      const existing = await readObserverStatus().catch(() => null);
      const record = existing ? normalizeObserverStatus(existing, {
        ok: existing.ok,
        capturedAt: existing.capturedAt,
        imageAvailable: existing.imageAvailable === true,
        imageVersion: existing.imageVersion,
        publishedAt: existing.publishedAt,
        sizeBytes: existing.sizeBytes,
        comparisons: existing.comparisons,
        health: existing.health
      }) : normalizeObserverStatus({ configured: false, ok: false });
      record.cameras = { ...(record.cameras || {}), return: cameraRecord };
      record.receivedAt = publishedAt;
      await writeObserverStatus(record);
      return res.status(200).json({
        ok: true,
        durable: true,
        cameraId: 'return',
        publishedAt: cameraRecord.publishedAt,
        capturedAt: cameraRecord.capturedAt,
        sizeBytes: cameraRecord.sizeBytes,
        healthStatus: cameraRecord.health?.status || 'pending'
      });
    }

    const latestImage = decodeObserverJpeg(body.imageBase64);
    const historyImages = decodeObserverHistoryImages(body.historyImages);
    const publishedAt = new Date().toISOString();
    const latestObject = await writeObserverImage(latestImage, 'latest');

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

    const existing = await readObserverStatus().catch(() => null);
    const record = normalizeObserverStatus({
      ...body,
      cameras: {
        ...(existing?.cameras || {}),
        overview: {
          ...body,
          imageAvailable: true,
          imageVersion: body.capturedAt || body.captured_at || latestObject.etag || publishedAt,
          publishedAt,
          sizeBytes: latestImage.length,
          comparisons
        }
      }
    }, {
      ok: body.ok !== false,
      imageAvailable: true,
      imageVersion: body.capturedAt || body.captured_at || latestObject.etag || publishedAt,
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
    const validationError = /Missing imageBase64|videoBase64|Base64|JPEG|MP4|timelapse|generatedAt|startCapturedAt|endCapturedAt|exceeds|padding|empty|historyImages|History image|slot|capturedAt/i.test(message);
    if (!validationError) console.error('Observer publish storage error', error);
    return res.status(validationError ? 400 : 503).json({
      ok: false,
      error: validationError ? message : 'Observer storage upload failed.'
    });
  }
}
