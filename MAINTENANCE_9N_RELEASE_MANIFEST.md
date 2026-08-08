# Reef Keeper Maintenance 9N — Return Water-Level Learning

Version: v4.3.70  
Publisher: 2.8.4  
Trainer: return-water-level-trainer.py 1.0.0

Maintenance 9N adds a Pi-side learning tool for the return chamber water-level monitor. It scans archived return-camera still images, re-runs the active right-side ROI detector on those frames, rejects low-confidence readings and large outliers, calculates normal water-level fluctuation, and recommends safer warning/urgent margins.

## Changed files

- `index.html`
- `package.json`
- `package-lock.json`
- `connector/observer-publisher.py`
- `connector/return-water-level-trainer.py`
- `connector/install-return-water-level-learning-1.0.sh`
- `tests/observer-9n-return-water-level-learning.test.mjs`
- Updated release/baseline Observer tests
- `MAINTENANCE_9N_RELEASE_MANIFEST.md`
- `MAINTENANCE_9N_TEST_REPORT.md`
- `checksums/maintenance-9N.sha256`

## Behavior

- Keeps 9M safe behavior: water-level ambiguity does not mark the return camera offline by default.
- Adds `learnedNormal` water-level diagnostics to the Publisher output when a learned profile exists in `return-monitoring.json`.
- Adds water-level threshold fields to the status payload:
  - `warningDeltaPercent`
  - `urgentDeltaPercent`
  - `maxLineJumpPercent`
- Adds a trainer script that reads the current ROI and baseline from `/etc/reefkeeper-observer/return-monitoring.json`.
- Trainer uses raw return-camera still images from `/mnt/reef-ssd/aquarium-observer/return-chamber/captures/`, not the MP4 timelapse.
- Trainer writes a learning report to `/mnt/reef-ssd/aquarium-observer/return-chamber/water-level-learning-report.json`.
- Trainer does not change thresholds unless run with `--apply`.

## Install command

After deploying the changed files to GitHub/Vercel:

```bash
curl -fsSL 'https://reefkeeper.vercel.app/connector/install-return-water-level-learning-1.0.sh?v=4.3.70-9n' \
  -o /tmp/install-return-water-level-learning-1.0.sh

bash /tmp/install-return-water-level-learning-1.0.sh
```

## Learning command

Report only:

```bash
sudo /opt/reefkeeper-observer/return-water-level-trainer.py \
  --camera return \
  --days 2 \
  --max-images 240
```

Apply recommended thresholds only after reviewing the report:

```bash
sudo /opt/reefkeeper-observer/return-water-level-trainer.py \
  --camera return \
  --days 2 \
  --max-images 240 \
  --apply

sudo systemctl start reefkeeper-observer-publish.service
```

## Safety notes

- The trainer does not move the ROI.
- The trainer does not recalibrate the baseline.
- The trainer only recommends wider thresholds when recent archive data supports it.
- Applying the report writes a `learned_normal` section into the return-monitoring config and updates warning/urgent/jump thresholds.
