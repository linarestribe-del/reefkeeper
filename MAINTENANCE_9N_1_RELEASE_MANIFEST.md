# Reef Keeper Maintenance 9N.1 Release Manifest

Version: v4.3.71  
Maintenance: 9N.1 — Feed-Aware Return Water-Level Monitoring  
Publisher: 2.8.5  
Trainer: 1.0.1

## Purpose

Maintenance 9N.1 keeps the return chamber camera healthy while making camera-based return water-level tracking less noisy. It is designed for the observed case where the return chamber rises during daily feeding because the return pumps are turned off for about five minutes.

## Changes

- Adds baseline-nearest waterline edge selection.
- Prevents a large edge jump from pausing tracking when the current reading has returned to the calibrated baseline.
- Adds feed-mode tolerant handling for temporary high return-chamber readings.
- Keeps persistent low or high readings capable of alerting after the configured streak threshold.
- Adds water-level diagnostics in published status:
  - selected edge strategy
  - strongest edge
  - candidate edges
  - line jump
  - feed-mode tolerance state
- Updates return water-level trainer to 1.0.1.
- Trainer recommendations now exclude likely feed-mode/pump-off high-water samples from the operating fluctuation band.

## Files Included

- `index.html`
- `package.json`
- `package-lock.json`
- `connector/observer-publisher.py`
- `connector/return-water-level-trainer.py`
- `connector/install-return-water-level-learning-1.1.sh`
- `tests/observer-9n1-feed-aware-water-level.test.mjs`
- Updated existing regression tests for v4.3.71 / Publisher 2.8.5
- `checksums/maintenance-9N-1.sha256`
- this manifest and test report

## Install

After GitHub/Vercel deploys v4.3.71, install on the Pi:

```bash
curl -fsSL 'https://reefkeeper.vercel.app/connector/install-return-water-level-learning-1.1.sh?v=4.3.71-9n1' \
  -o /tmp/install-return-water-level-learning-1.1.sh

bash /tmp/install-return-water-level-learning-1.1.sh
```

## Notes

This update does not move the active ROI or baseline. It changes how the existing calibrated ROI is interpreted.
