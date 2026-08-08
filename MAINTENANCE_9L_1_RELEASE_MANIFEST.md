# Reef Keeper Maintenance 9L.1 — Physical Estimate Priority Cleanup

Version: v4.3.68

Maintenance 9L.1 cleans up the Filter-roll card after physical roll-diameter calibration. The app now treats the latest physical diameter measurement as the primary estimate and forecast source, while camera readings remain visible as secondary diagnostics.

## Changed files

- `index.html`
- `filter-roll-engine.js`
- `filter-roll-status.js`
- `package.json`
- `package-lock.json`
- `tests/filter-roll-status.test.mjs`
- `tests/observer-9l-filter-roll-physical.test.mjs`
- `tests/observer-9l1-physical-priority.test.mjs`
- `MAINTENANCE_9L_1_RELEASE_MANIFEST.md`
- `MAINTENANCE_9L_1_TEST_REPORT.md`
- `checksums/maintenance-9L1.sha256`

## Behavior changes

- Top filter-roll badge now shows **Physical estimate** when the current percent comes from the latest physical diameter measurement.
- The app no longer labels large-radius disagreement as **View blocked** unless the rejection actually suggests obstruction, foam, glare, or another visibility issue.
- When recent camera readings disagree, the user-facing warning now says camera tracking is paused/unconfirmed and that the app is using the latest physical diameter for the current percent and forecast.
- Replacement forecast remains driven by physical measurements when available.
- Excluded camera readings remain visible in recent measurements for diagnostics.

## No Pi change required

This is an app/UI logic patch only. It does not change Cloudflare, the publisher, timelapse, return monitoring, or the Pi filter-roll detector.
