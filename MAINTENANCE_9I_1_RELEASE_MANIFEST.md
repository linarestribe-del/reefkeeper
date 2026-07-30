# Maintenance 9I.1 Release Manifest — Filter-Roll Blocked-View Wording

Version: Reef Keeper v4.3.61

## Purpose

Maintenance 9I.1 keeps the conservative Publisher 2.8.1 filter-roll detector behavior but improves the app-side explanation when the latest scheduled reading is rejected because the roll view is likely blocked or unreliable.

## Changes

- Uses **View blocked** when a newer rejected camera attempt follows multiple good accepted readings and the rejection suggests obstruction, glare, foam, or a large apparent radius drop.
- Pauses the displayed usage trend after a rejected scheduled attempt instead of continuing to show **Normal**.
- Shows **Limited** confidence with the rejection context instead of generic stale/learning text.
- Keeps the last accepted camera estimate visible and does not replace it with the rejected reading.
- Bumps browser cache/version references to v4.3.61.

## Pi impact

No Raspberry Pi update is required. Publisher remains 2.8.1 and Timelapse Builder remains 1.2.
