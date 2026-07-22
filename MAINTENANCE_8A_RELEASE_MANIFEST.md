# Reef Keeper Maintenance 8A Release Manifest

## Release

- Version: `4.3.43`
- Baseline: verified `4.3.42 / Maintenance 7B`
- Scope: migrate Aquarium Observer remote storage from paused Vercel Blob to private Cloudflare R2

## Intentional runtime changes

- Adds `lib/observer-r2.js` as the active storage implementation and reduces `lib/observer-blob.js` to a dependency-free compatibility re-export for safe browser-based repository overlays.
- Stores current/history images, status, daily summaries, alerts, and timelapses in the private `reefkeeper-observer` R2 bucket.
- Uses the Cloudflare R2 S3-compatible API with AWS Signature Version 4 generated from Node.js built-ins.
- Keeps all existing Observer API routes and the Raspberry Pi publisher protocol unchanged.
- Removes the `@vercel/blob` dependency and produces a dependency-free package lock.
- Adds four required Vercel environment variables:
  - `REEF_OBSERVER_R2_ENDPOINT`
  - `REEF_OBSERVER_R2_ACCESS_KEY_ID`
  - `REEF_OBSERVER_R2_SECRET_ACCESS_KEY`
  - `REEF_OBSERVER_R2_BUCKET`

## Security boundary

- The R2 bucket remains private.
- R2 credentials exist only in Vercel environment variables and are not sent to the browser or Raspberry Pi.
- The Pi continues authenticating to `/api/observer-publish` with the existing `REEF_OBSERVER_WRITE_TOKEN`.
- Browser image and video access remains same-origin through `/api/observer-image`.
- Signed R2 requests reject redirects to prevent credential-bearing headers from being forwarded.

## Explicitly unchanged

- local Tapo capture and 1 TB SSD archive;
- capture and timelapse timers;
- Observer UI, history slots, daily-summary logic, alerts, and timelapse metadata;
- Ask AI, Apex, navigation, storage schemas, and all non-Observer APIs;
- Vercel function count, which remains 12.

## Activation sequence

1. Deploy this build while the Pi publisher timer remains disabled.
2. Add the four R2 variables to Vercel Production.
3. Redeploy the latest production build.
4. Manually run the Observer publisher once from the Pi.
5. Verify the current image and status in Reef Keeper.
6. Re-enable the publisher timer only after the manual publish passes.

## Rollback

Restore `4.3.42 / Maintenance 7B` and leave the Pi publisher disabled. Because Vercel Blob access is paused, Observer remote publishing will remain unavailable on the rollback build, but the rest of Reef Keeper remains usable.
