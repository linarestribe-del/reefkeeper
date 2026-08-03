# Reef Keeper v4.3.65 Maintenance 9K.1 — Cloudflare Media Routing Fix

## Purpose

Maintenance 9K.1 fixes the first live Cloudflare Worker/R2 cutover issue: status data was reaching the app, and image objects were present in R2, but the browser was still being handed legacy relative media paths such as `/api/observer-image`.

## Included changes

- Vercel `/api/observer-status` now re-normalizes stored Observer status records before returning them.
- When `REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL` is set, stored legacy `/api/observer-image` paths are converted to direct Cloudflare object URLs.
- Cloudflare Worker `/api/observer-status` now decorates status responses with direct public image URLs.
- Cloudflare Worker timelapse status now decorates available videos with direct public MP4 URLs.
- Cloudflare Worker `/api/observer-image` now accepts `HEAD` as well as `GET` for diagnostics.
- Cloudflare Worker daily-summary POST returns `ok: true` while daily AI summary generation remains paused/storage-only on the Worker backend.
- App version bumped to v4.3.65 Maintenance 9K.1.

## Deployment order

1. Upload the changed files to GitHub and let Vercel deploy.
2. Redeploy the Cloudflare Worker from `cloudflare/observer-worker.js`.
3. Confirm `REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL=https://reefkeeper-observer.reefkeeper.workers.dev` is set in Vercel Production.
4. Run one manual Pi publish before re-enabling the publish timer.

## Timer safety

Keep `reefkeeper-observer-publish.timer` disabled until one manual publish succeeds and the app image appears.
Keep `reefkeeper-observer-timelapse.timer` disabled until image/status routing is confirmed.
