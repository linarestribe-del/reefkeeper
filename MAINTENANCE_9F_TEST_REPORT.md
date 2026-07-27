# Reef Keeper Maintenance 9F Test Report

Release: **v4.3.55 Maintenance 9F — Observer Visual Reliability**

Baseline: **v4.3.54 Maintenance 9E.1**

## Result

**PASS**

## Verification completed

- Full `npm test` suite passed in the working release.
- Full `npm test` suite passed again after applying only the changed 9F files to a clean v4.3.54 baseline.
- JavaScript syntax passed for **78 files** and **18 inline index scripts**.
- DOM reference integrity passed for **242 literal element references**; global-function integrity passed across **17 browser scripts**.
- Maintenance-scene testing proved that central skimmer/GFO/equipment movement can settle and auto-adapt while fixed anchors remain stable.
- Real camera movement, obstruction, and fixed-anchor warning safeguards remain active.
- Three-frame filter-roll consensus and disagreement handling passed.
- Large radius-drop rejection and later-window confirmation safeguards passed.
- The last accepted filter-roll measurement remains available after a rejected attempt.
- Analysis messages and actual rejection reasons remain preserved in attempt history.
- Publisher 2.8.0 and both calibration helpers passed Python syntax validation.
- The Publisher 2.8.0 installer passed shell syntax validation, checksum assertions, private-config migration assertions, and rollback safeguards.
- Calibration helpers contain `root:reefkeeper` ownership and `0640` permission handling.
- Repository integrity passed with no Python caches or nested repository copies.
- Vercel function count passed at **12/12**.

## Deployment boundary

Maintenance 9F requires the v4.3.55 web deployment first, followed by the rollback-ready Raspberry Pi `install-observer-publisher-2.8.0.sh` update. Existing capture services and credentials are not changed.
