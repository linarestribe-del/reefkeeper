# Maintenance 9J Release Manifest — Observer Cost Architecture

Version: Reef Keeper v4.3.63 Maintenance 9J

## Purpose

Vercel Hobby usage exceeded Fast Origin Transfer and Blob Advanced Operations during frequent Observer camera publishing. Maintenance 9J does not resume cloud publishing. It adds the first low-risk architecture change needed to reduce Vercel media proxy traffic once Cloudflare R2 public/custom-domain delivery is configured.

## Changes

- Adds optional direct Observer media URLs through `REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL`.
- Keeps private same-origin `/api/observer-image` delivery as the safe fallback.
- Applies direct media URLs to:
  - sump overview latest/current/history images,
  - return chamber latest image,
  - overview weekly/monthly timelapses,
  - return chamber weekly/monthly timelapses.
- Rejects non-HTTPS public media bases and falls back to the existing proxy.
- Adds regression coverage proving the fallback remains unchanged and direct R2 URLs are generated only when explicitly configured.
- Keeps Vercel function count at 12/12.

## Operational guidance

- Leave Pi cloud publishing paused while Vercel usage is exceeded.
- Configure direct R2 media only after the R2 bucket public/custom domain is intentionally created.
- Do not place R2 access keys in the browser or in this variable.
- Direct media delivery only reduces browser image/video proxy transfer. Moving writes/status off Vercel requires a later Cloudflare Worker or direct Pi-to-R2 migration.

## Rollback

Remove `REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL` from Vercel Production environment variables or redeploy the prior v4.3.62 files. Without the variable, v4.3.63 falls back to the prior same-origin media proxy behavior.
