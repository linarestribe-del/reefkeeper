# Maintenance 9L.1 Test Report

Version: v4.3.68

## Tests run inside changed-files package

- `node tests/filter-roll-status.test.mjs` — PASS
- `node tests/observer-9l-filter-roll-physical.test.mjs` — PASS
- `node tests/observer-9l1-physical-priority.test.mjs` — PASS

## Verified behavior

- Physical diameter measurements still calculate the correct remaining percent:
  - 63 mm = about 23.5% remaining.
  - 59 mm = about 17.3% remaining.
- The latest physical measurement controls current percent and current diameter.
- The physical usage trend remains available from the two physical readings.
- Replacement forecast remains physical-estimate based.
- When a newer camera reading is rejected for radius disagreement, the top badge remains **Physical estimate** instead of **View blocked**.
- Rejected camera readings remain diagnostic-only.
- Cache-busted app references now use v4.3.68.

## Note

Full repository `npm test` was not run from the changed-files-only package because it does not contain every unchanged source file from the live repository. The included tests target the modified Maintenance 9L.1 files.
