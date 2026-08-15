# Reef Keeper Maintenance 9N.2 Release Manifest

Version: v4.3.72  
Maintenance: 9N.2 — Filter-Roll Replacement Cycle Display Cleanup

## Purpose

Maintenance 9N.2 cleans up the Filter-Roll Status card after a fleece roll replacement is logged. It keeps the new physical replacement baseline as the clear source of truth and prevents old camera diagnostics from dominating the main card immediately after a new roll is installed.

## Changes

- Updates app settings label to `Reef Keeper v4.3.72 Maintenance 9N.2`.
- Updates filter-roll script cache keys to `v=4.3.72`.
- Shows `New cycle` and `New cycle started — physical baseline` when the latest physical measurement is a fresh 100% replacement baseline.
- Suppresses prior-cycle camera warnings from the main Filter-Roll card after a replacement baseline is logged.
- Shows `Learning this roll` instead of `Holding last good reading` for the new-roll replacement forecast.
- Shows `Pending for this new roll` for camera readings when the last accepted camera measurement belongs to the prior roll cycle.
- Hides prior-cycle measurements from the primary recent-measurements list once a new physical 100% baseline is active.
- Stops seeded old physical measurements from being added after completed roll cycles are present.
- Preserves prior-cycle camera and rejected readings in diagnostics/archive rather than treating them as the active state.

## Operational Notes

This is an app/UI and filter-roll logic cleanup only. It does not require a Raspberry Pi reinstall, and it does not change Publisher 2.8.5, return water-level monitoring, Cloudflare media, timelapse behavior, or the existing roll-replacement data.

## Expected UI After Deployment

After the current replacement entry of `97.0 mm · 100.0%`, the Filter-Roll card should emphasize:

- `100.0% estimated remaining`
- `New cycle`
- `New cycle started — physical baseline`
- `Latest physical measurement: 97.0 mm · 100.0%`
- `Replacement forecast: Learning this roll`

Old camera warnings such as `Paused — view blocked`, `Holding last good reading`, and `latest measurement is stale` should no longer be the headline state for the newly replaced roll.
