# Maintenance 9C.3 Test Report

## Scope

Maintenance 9C.3 corrects repeated-frame confirmation counting in Observer Publisher 2.7.3.

## Regression reproduced and corrected

- A configured water-level shift is evaluated with capture key `return-capture-001`.
- The first evaluation produces pending status with streak 1.
- Re-evaluating the same pixels with the same capture key remains at streak 1.
- Evaluating a second unique capture key advances to streak 2 and reaches the configured attention threshold in the deterministic test fixture.
- The saved monitor state records whether the most recent evaluation represented a new capture.

## Additional safeguards

- Overview and return publishers pass the capture timestamp into local monitoring.
- Return monitoring analyzes the immutable dated image selected from camera status.
- Obstruction, scene-change, movement, water-level, and baseline-learning state all honor the unique-capture boundary.
- Existing separate overview and return monitor-state paths remain intact.

## Automated results

`npm test` passed in full:

- JavaScript syntax, DOM, navigation, and stable-baseline safeguards
- Integration Core and filter-roll behavior
- Dual-camera Observer publisher and API behavior
- Observer health, local-monitor, history, alerts, daily summary, and timelapse behavior
- New repeated-capture streak regression
- Repository integrity
- Vercel Hobby function count: 12/12

Additional checks passed:

- Python syntax compilation for Publisher and both calibration helpers
- Bash syntax validation for the Publisher 2.7.3 installer
