# Maintenance 9C Test Report

## Full suite result

- `npm test` ✅ PASS

## Coverage

- Existing-roll initialization from `85 / 100 / 46 mm`
- Calculated starting estimate of approximately `64.8%`
- Partial-cycle preservation through Integration Core resynchronization
- Outer-edge-only measurement with no core/spindle requirement
- Physical-to-camera calibration using the first accepted apparent outer radius
- Observer API null handling when no apparent core radius is supplied
- Publisher 2.7, filter-roll calibration helper, installer syntax, and verified file hashes
- Dual-camera Observer, local monitoring, reports, alerts, AI safeguards, repository integrity, and Vercel function-count limits

## Safety behavior

- Manual initialization clears any earlier camera baseline in the active cycle.
- The current roll is explicitly marked as a partial cycle.
- Apparent camera radius is stored as projection pixels, never represented as millimeters.
- The filter-roll ROI remains disabled until it is tested and explicitly saved on the Raspberry Pi.
