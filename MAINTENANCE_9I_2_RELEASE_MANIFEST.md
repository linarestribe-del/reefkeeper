# Maintenance 9I.2 Release Manifest — Filter-Roll Accepted-Reading Cleanup

Version: Reef Keeper v4.3.62
Baseline: Reef Keeper v4.3.61 Maintenance 9I.1
Release type: App-only filter-roll UI and deterministic engine correction

## Purpose

Maintenance 9I.2 fixes the case where an older rejected filter-roll attempt continued to display as an active warning after a newer accepted camera reading arrived.

## Changes

- Clears active rejected-attempt warnings when the latest accepted camera measurement is newer than the latest rejected attempt.
- Keeps older rejected attempts visible only as diagnostic history.
- Deduplicates same-window camera records by source and minute, so radius-only and converted-percent records for the same capture collapse into one row.
- Prefers the converted percentage record over duplicate radius-only records.
- Prevents older rejected attempts from forcing `Needs calibration`, `View blocked`, or `Holding last good reading` states after a successful accepted reading.
- Bumps app/cache version to v4.3.62 Maintenance 9I.2.

## Runtime impact

- Browser/app only.
- No Raspberry Pi update required.
- Publisher remains 2.8.1.
- Timelapse Builder remains 1.2.
- Vercel function count remains unchanged.
