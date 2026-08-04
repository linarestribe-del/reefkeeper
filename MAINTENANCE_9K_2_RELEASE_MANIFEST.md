# Maintenance 9K.2 Release Manifest — Reef Keeper v4.3.66

## Purpose

Maintenance 9K.2 cleans up the remaining Cloudflare migration issue after 9K.1: the Pi publisher could record `dailySummaryError: Publish returned HTTP 200` when the Cloudflare Worker intentionally acknowledged daily-summary uploads as storage-only/reused rather than generating a Vercel AI daily summary.

## Changes

- Adds Pi Publisher 2.8.2.
- Adds a dedicated daily-summary POST helper that accepts the Cloudflare Worker storage-only acknowledgement as success.
- Clears the stale false retry state caused by the previous `Publish returned HTTP 200` daily-summary error.
- Keeps overview and return-camera publishing unchanged.
- Keeps Cloudflare direct image/media routing from 9K.1.
- Keeps the publisher timer on its 15-minute cadence.
- Leaves the timelapse timer off until the next explicit verification step.

## Files

- `connector/observer-publisher.py`
- `connector/install-observer-publisher-2.8.2.sh`
- `cloudflare/observer-worker.js`
- `api/observer-status.js`
- `docs/OBSERVER_CLOUDFLARE_WORKER_9K.md`
- `index.html`
- `package.json`
- `package-lock.json`
- `tests/observer-9k2-daily-summary.test.mjs`
- `tests/observer-9k-cloudflare-worker.test.mjs`
- `tests/observer-9k1-media-routing.test.mjs`
- supporting regression test files included for repository overlay continuity

## Deployment order

1. Upload the unzipped files to GitHub and let Vercel deploy.
2. Redeploy the Cloudflare Worker using `cloudflare/observer-worker.js`.
3. Run `connector/install-observer-publisher-2.8.2.sh` on the Raspberry Pi.
4. Verify `publisherVersion: 2.8.2` and that `dailySummaryError` is no longer `Publish returned HTTP 200`.

## Rollback

The installer creates a timestamped backup of the active publisher script before replacing it and rolls back automatically if the controlled publish fails.
