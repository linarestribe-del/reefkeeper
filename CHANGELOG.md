# Reef Keeper v4.3.4 — Auto Telemetry Hub

## Fixed
- Removed the need to maintain `telemetry-config.js` for each preview branch.
- Production now reads telemetry from its own `/api/telemetry` endpoint.
- Preview deployments and local testing automatically read telemetry from `https://reefkeeper.vercel.app/api/telemetry`.
- Prevents stale preview URLs from breaking Live Telemetry.

## Notes
- Keep the Mac Apex connector pointed at `https://reefkeeper.vercel.app`.
- `telemetry-config.js` is no longer required for this release.
