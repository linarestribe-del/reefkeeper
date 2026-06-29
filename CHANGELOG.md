# Changelog

## v4.2.1 — Telemetry Hardening

- Added `api/telemetry.js` to the package so the stable hub endpoint is included with the patch.
- Updated `apex-bridge.js` so `telemetry-config.js` takes priority over stale browser `localStorage` settings.
- Added a global `REEF_KEEPER_TELEMETRY_ENDPOINT` alias in `telemetry-config.js`.
- Updated cache-busting in `index.html` to v4.2.1.
- Improved the Mac Apex connector:
  - saved Apex session cookie reuse;
  - best-effort automatic Apex login attempts;
  - retry after 401;
  - clearer error messages;
  - connector heartbeat metadata;
  - durable-storage status in output.
- Added connector documentation for stable hub, cookie fallback, continuous mode, and Vercel KV variables.

## v4.2.0 — Stable Telemetry Hub

- Added stable telemetry endpoint configuration for preview branches.
- Updated bridge reader to support a canonical cloud telemetry endpoint.
