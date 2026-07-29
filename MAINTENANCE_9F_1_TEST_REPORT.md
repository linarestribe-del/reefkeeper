# Maintenance 9F.1 Test Report

Validation performed against a clean v4.3.55 baseline overlay.

- JavaScript syntax checks: pass.
- Full npm test suite: pass.
- Vercel function limit: unchanged at 12/12.
- Publisher update: none; 2.8.0 remains active.

Key cases covered:
- Direct filter-roll replacement action is exposed and wired to Integration Core.
- Scheduled-window placeholder filter-roll states are not displayed as measurements.
- Duplicate filter-roll measurements from the same capture/time window collapse to the best reading.
- Active Observer alerts are scoped by selected camera.
- Return chamber tools explain current timelapse limitations instead of showing sump overview tools.
