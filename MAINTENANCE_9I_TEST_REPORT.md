# Maintenance 9I Test Report

## Result

PASS — full repository regression suite completed successfully.

## Verification performed

- `npm test` completed successfully.
- JavaScript syntax passed for 80 files and 18 inline scripts.
- DOM reference integrity passed for 242 literal element references.
- Repository integrity passed.
- Vercel function count passed at 12/12.
- Existing dual-camera Observer tests passed.
- Existing 9F reliability tests passed.
- Existing 9G return-chamber timelapse tests passed.
- Existing 9H data-saver tests passed.
- New 9I filter-roll reliability test passed.
- Updated filter-roll status tests passed.

## New 9I assertions

- A rejected scheduled attempt does not replace the last accepted filter-roll reading.
- Low detector confidence and large radius decrease can both appear in the same preserved rejection reason.
- A newer rejected attempt causes the app to display **Holding last good reading** rather than a stale-state warning.
- Forecasting is held when the latest attempt is rejected and accepted camera history remains young.
- Publisher version is 2.8.1.
