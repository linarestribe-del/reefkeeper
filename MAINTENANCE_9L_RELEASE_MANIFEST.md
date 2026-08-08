# Reef Keeper Maintenance 9L — Physical Filter-Roll Calibration

Version: v4.3.67

## Purpose

Maintenance 9L updates the filter-roll card so recent physical roll-diameter measurements can control the current remaining percentage and replacement forecast.

## Included changes

- Adds physical filter-roll calibration support.
- Seeds the current physical measurements provided during setup:
  - 63 mm at 2026-08-06 00:19 PDT.
  - 59 mm at 2026-08-07 23:19 PDT.
- Uses roll area geometry with 100 mm full diameter and 46 mm core diameter.
- Current physical estimate becomes approximately 17.3% remaining.
- Adds a "Log physical roll diameter" form in the Filter-roll details panel.
- Physical diameter measurements can override camera percent while camera tracking remains visible as support/diagnostics.
- Adds a physical recent usage trend and a physical replacement forecast window.
- Bumps app cache/version references to v4.3.67 Maintenance 9L.

## Not changed

- No Cloudflare Worker changes.
- No Pi publisher changes.
- No timelapse changes.
- No return chamber monitoring changes.
- No filter-roll detector/schedule/ROI changes on the Pi.

## Files

- index.html
- filter-roll-engine.js
- filter-roll-status.js
- package.json
- package-lock.json
- tests/filter-roll-status.test.mjs
- tests/observer-9l-filter-roll-physical.test.mjs
