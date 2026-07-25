# Maintenance 9C.2 Test Report

## Scope

Maintenance 9C.2 corrects the return-camera local-monitor state path in Observer Publisher 2.7.2.

## Regression reproduced

Publisher 2.7.1 accepted a caller-provided return-camera `state_path` but wrote the evaluated state to the fixed overview `MONITOR_STATUS_PATH`. This left the return-camera `monitor-status.json` stale even though `/etc/reefkeeper-observer/return-monitoring.json` contained a valid ROI and baseline.

## Correction verified

- `evaluate_local_monitor()` now writes to its resolved `state_path` argument.
- A dedicated regression test invokes return-camera monitoring with separate overview and return state files.
- The test confirms that the return state is created and the overview state is not overwritten.
- Publisher version and verified installer were advanced to 2.7.2.

## Automated results

`npm test` passed in full:

- JavaScript syntax and global-function integrity
- DOM and navigation regressions
- Integration Core and filter-roll behavior
- Dual-camera Observer publisher and API behavior
- Observer health, local-monitor, history, alerts, daily summary, and timelapse behavior
- New return-monitor state-path regression
- Repository integrity
- Vercel Hobby function count: 12/12

Additional checks passed:

- Python syntax compilation for Publisher and both calibration helpers
- Bash syntax validation for the Publisher 2.7.2 installer
