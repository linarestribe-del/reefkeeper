# Reef Keeper Maintenance 9O Release Manifest

Version: v4.3.73  
Maintenance: 9O — Filter-Roll Diagnostics Cleanup After Accepted Camera Reading  
Scope: App/UI only. No Pi reinstall required.

## Purpose

Maintenance 9O keeps the latest accepted filter-roll camera reading prominent and collapses older rejected camera attempts after a newer camera reading has been accepted. This prevents outdated red diagnostic rows from dominating the Filter-Roll Status card once the camera has recovered and is producing healthy readings again.

## Changes

- Updates app settings label to `Reef Keeper v4.3.73 Maintenance 9O`.
- Bumps filter-roll script cache tags to `v=4.3.73`.
- Updates `filter-roll-engine.js` status version to `9O`.
- Splits filter-roll measurement rendering into a reusable row renderer.
- Collapses superseded rejected camera rows into a closed `Camera diagnostics` disclosure when a newer accepted camera reading exists.
- Keeps current accepted camera readings and physical measurements visible in Recent measurements.
- Does not change camera ROI, publisher behavior, Cloudflare media, water-level monitoring, or saved roll history.

## Expected UI behavior

After the Aug 14 8:25 PM accepted camera reading, older rejected camera attempts should no longer appear as large red rows in the main Recent measurements list. They remain available under Camera diagnostics for troubleshooting.

## Files changed

- `index.html`
- `filter-roll-engine.js`
- `filter-roll-status.js`
- `package.json`
- `package-lock.json`
- `tests/observer-9o-filter-roll-diagnostics-collapse.test.mjs`
- related versioned regression tests
- `MAINTENANCE_9O_RELEASE_MANIFEST.md`
- `MAINTENANCE_9O_TEST_REPORT.md`
- `checksums/maintenance-9O.sha256`
