# Reef Keeper Maintenance 9E Release Manifest

Release: **v4.3.53 Maintenance 9E — Observer Simplification and Alert Lifecycle**

Baseline: **v4.3.52 Maintenance 9D**

## Scope

Maintenance 9E is an app-side Observer usability and state-management release. It does not change Raspberry Pi Publisher 2.7.3, camera capture services, remote storage contracts, or the Vercel function count.

## User-facing changes

- Reorganizes Aquarium Observer into a compact operational hierarchy: live view, current needs-attention inbox, filter-roll status, daily summary, and collapsed tools.
- Moves technical camera metadata, health checks, local monitoring, timelapses, and history comparisons into disclosures.
- Removes the duplicate legacy Filter Roller Learning card.
- Removes the instructional camera-use card from the daily operational page.
- Reviewed alerts leave the active inbox immediately and move to collapsed reviewed history.
- Persistent system conditions use stable identities so a reviewed condition does not become “new” merely because the date changes.
- Active alert counts and summaries include only current unreviewed alerts.
- Return-chamber water-level calibration is hidden while the Sump Overview camera is selected.
- Daily visual summaries default to a concise overview with the full report collapsed.
- The Observer scroll-to-top control is reduced and moved away from right-side values.

## Filter-roll corrections

- Scheduler/idle records without a quantitative radius, diameter, or remaining percentage are no longer added as excluded measurements.
- The manual baseline no longer displays a misleading 100% confidence value; it is labeled as a physical entry.
- The first camera radius used to establish visual scale is marked as a camera reference and excluded from usage-rate calculations.
- The source label distinguishes a manual baseline with an established camera reference from an independent camera estimate.
- Measurement freshness is evaluated against the configured 9:00 AM, 3:00 PM, and 9:00 PM schedule plus tolerance instead of a fixed 1.5-hour threshold.
- Rejected quantitative readings remain visible for diagnostics, while misleading idle-window text is replaced by a threshold-specific reason when possible.
- Repeated rejected or stale tracking after reference establishment is labeled **Needs calibration**.

## Files changed

- `index.html`
- `app.css`
- `css/app.css`
- `observer.js`
- `api/observer-alerts.js`
- `integration-core.js`
- `lib/observer-common.js`
- `filter-roll-engine.js`
- `filter-roll-status.js`
- `filter-roll-status.css`
- `package.json`
- `package-lock.json`
- regression tests and release documentation

## Explicitly unchanged

- `connector/observer-publisher.py` remains Publisher **2.7.3**.
- No Vercel function was added.
- No camera credentials or private-network addresses are exposed.
- Existing maintenance, parameter, Ask AI, and Observer API routes remain intact.
