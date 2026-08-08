# Maintenance 9L Test Report

Version: v4.3.67

## Passed

- JavaScript syntax check: filter-roll-engine.js
- JavaScript syntax check: filter-roll-status.js
- Filter-roll geometry test:
  - 63 mm / 100 mm / 46 mm = about 23.5% remaining
  - 59 mm / 100 mm / 46 mm = about 17.3% remaining
- Physical trend test:
  - 63 mm at 2026-08-06T07:19Z and 59 mm at 2026-08-08T06:19Z produce about 3.1 percentage points/day.
- Current source test:
  - Latest physical diameter measurement controls current remaining percent over older camera estimate.
- UI source test:
  - Filter-roll card includes the physical diameter logging form.
  - Cache-busted v4.3.67 script links are present.
- 9K.2 daily-summary regression test passed in overlay.

## Notes

Full repository npm test was not run from the changed-files-only package because it does not contain every unchanged source file from the live repository. The included tests target the modified Maintenance 9L files.
