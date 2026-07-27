# Reef Keeper Maintenance 9F Release Manifest

Release: **v4.3.55 Maintenance 9F — Observer Visual Reliability**

Baseline: **v4.3.54 Maintenance 9E.1**

## Scope

Maintenance 9F upgrades the Raspberry Pi Observer publisher from **2.7.3** to **2.8.0** and makes visual monitoring tolerant of normal sump maintenance. It also strengthens filter-roll acceptance, preserves rejected-attempt evidence, and fixes private calibration-file ownership automatically. The existing dual-camera, R2, API, and 12-function Vercel architecture is retained.

## Maintenance-tolerant scene monitoring

- Replaces exact whole-frame matching with fixed **anchor zones** and a separate full-view comparison.
- Treats movement in the skimmer, GFO reactor, hoses, lids, cords, and other serviceable equipment areas as expected maintenance variation when the fixed anchors remain stable.
- Uses a short settling streak, then gradually adapts the baseline instead of raising a persistent sump-scene warning.
- Continues to raise Attention for actual camera movement, obstruction, or a persistent change in fixed cabinet/plumbing anchors.
- Publishes anchor score, full-view score, learning state, and maintenance-variation state for diagnostics.

## Filter-roll reliability

- Changes the normal schedule to **9 AM and 3 PM**, avoiding the less dependable night-lighting window until separately calibrated.
- Raises the default acceptance threshold to **65% confidence**.
- Requires agreement across recent fixed-view frames and reports the median apparent radius, frame count, and radius deviation.
- Rejects implausible radius decreases and requires confirmation in a later scheduled window before accepting a large change.
- Caps the automatically permitted decrease so a long measurement gap cannot legitimize an extreme one-frame drop.
- Preserves `lastAccepted`, `lastAttempt`, `attemptHistory`, the analysis message, and the actual rejection reason. A rejected attempt no longer overwrites the last valid estimate or becomes a false measurement row.

## Calibration and private-file safety

- `observer-filter-roll-calibrate.py` now saves the consensus-v2 configuration with owner `root`, group `reefkeeper`, and mode `0640`.
- `observer-water-level-calibrate.py` applies the same readable private-file permissions.
- The Publisher 2.8.0 installer migrates the existing filter-roll settings, verifies that the publisher user can read them, and preserves rollback backups.

## Deployment

1. Upload the Maintenance 9F web files and allow Vercel to deploy v4.3.55.
2. Run `connector/install-observer-publisher-2.8.0.sh` on the Raspberry Pi after the web deployment is live.
3. The installer performs checksummed downloads, backups, configuration migration, a controlled dual-camera publish, and automatic rollback on failure.

## Explicitly unchanged

- Vercel remains at **12/12 functions**.
- Existing camera capture services and five-minute capture cadence remain unchanged.
- No credentials, RTSP URLs, R2 secrets, or private local paths are added to the repository.
- Filter-roll physical calibration remains the existing 85/100/46 mm partial-cycle baseline unless the user recalibrates it.
