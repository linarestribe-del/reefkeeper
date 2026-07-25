# Maintenance 9D Test Report

## Deterministic coverage

- Verified 85/100/46 mm roll geometry produces 64.8% remaining.
- Verified manual initialization remains the current source until an accepted camera measurement exists.
- Verified the manual baseline is not mislabeled as the latest camera measurement.
- Verified repeated publication of the same capture is deduplicated.
- Verified excluded camera readings remain visible but do not enter the trend.
- Verified multi-day accepted history produces a usage rate, confidence result, and provisional date range.
- Verified sparse history remains in `Still learning` state.

## Integration coverage

- The UI reads the existing `reef_observer_filter_roll_state_v1` cycle managed by Maintenance 9A.
- Only the current cycle feeds the current trend, preventing completed-roll resets from contaminating the slope.
- The latest Observer outer-radius reading is converted through the saved physical calibration when necessary.
- The card is mounted after the existing Filter Roller Learning section.
- JavaScript and CSS assets are linked from the actual application shell, not an exported-report template.
- Explicit Vercel static routes serve all three new assets before the SPA fallback.
- No Vercel function was added; the Hobby function count remains 12/12.

## Regression result

The complete `npm test` suite passed, including JavaScript syntax, DOM integrity, stable-baseline, navigation, Integration Core, Observer, filter-roll publisher, repository integrity, and Vercel function-count safeguards.
