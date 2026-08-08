# Maintenance 9N Test Report

## Static checks

- `python3 -m py_compile connector/observer-publisher.py`: PASS
- `python3 -m py_compile connector/return-water-level-trainer.py`: PASS
- `bash -n connector/install-return-water-level-learning-1.0.sh`: PASS
- `node tests/observer-9n-return-water-level-learning.test.mjs`: PASS in the staged package

## Verification targets

- App version updated to `Reef Keeper v4.3.70 Maintenance 9N`.
- Publisher version updated to `2.8.4`.
- Publisher still includes 9M water-level safe mode:
  - `tracking_paused`
  - `allow_offline` default false
  - disabled water-level tracking remains healthy instead of offline
- Publisher now surfaces learned water-level diagnostics:
  - `learnedNormal`
  - `warningDeltaPercent`
  - `urgentDeltaPercent`
  - `maxLineJumpPercent`
- Trainer includes:
  - archive still-image scan
  - confidence cutoff
  - outlier rejection
  - normal fluctuation band
  - recommended warning/urgent thresholds
  - report-only default
  - `--apply` mode for explicit config changes

## Runtime expectation

After install, the Pi should report:

```text
Publisher version: 2.8.4
Return publish successful: True
Trainer installed: /opt/reefkeeper-observer/return-water-level-trainer.py
UPDATE RESULT: PASS — 9N WATER-LEVEL LEARNING INSTALLED
```

After running the trainer without `--apply`, it should produce a report but leave the active return water-level thresholds unchanged.
