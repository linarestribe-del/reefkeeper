# Maintenance 9C Release Manifest

- Application version: `4.3.49`
- Maintenance release: `9C`
- Focus: Manual initialization for an already-used filter roll and outer-edge-only camera measurement.

## Included changes

1. **Existing-roll initialization**
   - Observer now accepts current, full, and core outside diameters.
   - The provided `85 / 100 / 46 mm` values initialize the current roll at approximately `64.8%` remaining.
   - The current roll is marked as a partial cycle rather than a complete full-roll cycle.

2. **Outer-edge detector**
   - Publisher 2.7 measures only the outer roll silhouette across multiple nearby scan lines.
   - Acrylic spindle and core reflections are not used to calculate the roll boundary.
   - Apparent radius is explicitly treated as a fixed-view pixel measurement, not millimeters.

3. **Physical-to-camera calibration**
   - The first accepted camera measurement after manual initialization maps the 85 mm physical roll to the fixed camera projection.
   - Future percentage estimates use projected annulus area with the known 100 mm full roll and 46 mm core.

4. **Pi tooling**
   - Added `connector/install-observer-publisher-2.7.sh`.
   - Added `connector/observer-filter-roll-calibrate.py`.
   - Installer verifies Publisher 2.7 and both calibration helpers, and rolls back to Publisher 2.6 on failure.

## Deployment order

1. Deploy the v4.3.49 web files.
2. In Observer, initialize the current roll with `85`, `100`, and `46` mm.
3. Install Publisher 2.7 on the Raspberry Pi.
4. Test the outer-edge ROI, then save it only after the result is visually plausible and repeatable.
