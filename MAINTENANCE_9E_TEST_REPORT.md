# Reef Keeper Maintenance 9E Test Report

Release: **v4.3.53 Maintenance 9E — Observer Simplification and Alert Lifecycle**

Baseline: **v4.3.52 Maintenance 9D**

## Result

**PASS**

## Verification completed

- Full `npm test` suite passed.
- JavaScript syntax passed for **77 files** and **18 inline index scripts**.
- Global-function integrity passed across **17 browser scripts**.
- DOM reference integrity passed for **242 literal element references** after the Observer restructure.
- Navigation, mobile positioning, index cleanup, stable-baseline, and release-regression checks passed.
- Integration Core migration, replacement-cycle, manual-baseline, camera-reference, and follow-up measurement checks passed.
- Observer dual-camera, Cloudflare R2, publishing bridge, history, health, local monitor, daily summary, alerts, and timelapse tests passed.
- Maintenance 9E alert lifecycle and compact-layout safeguards passed.
- Filter-roll geometry, unique-capture deduplication, reference-only trend gating, schedule-aware freshness, warning, and forecast tests passed.
- Repository integrity passed.
- A changed-files-only overlay was applied to a clean v4.3.52 Maintenance 9D checkout and the complete suite passed again.
- Vercel function count passed at **12/12**.
- Observer Publisher remains **2.7.3**.

## Defects specifically covered

- Reviewed current alerts disappear from the active inbox.
- Active badges and summaries count only current unreviewed alerts.
- Reviewed items are preserved in collapsed history without changing their review time on rerender.
- Persistent system conditions retain stable identities across dates.
- A reviewed system condition rearms only after it clears and later returns, or its severity changes.
- The old duplicate Filter Roller Learning card is absent.
- Scheduler/idle filter-roll states without a radius, diameter, or percentage do not become measurement rows.
- The manual physical baseline is not shown as “100%”.
- The first camera radius is marked as a reference and excluded from independent usage-rate calculations.
- Measurement staleness follows scheduled windows rather than a fixed 1.5-hour timeout.
- Return-chamber water-level calibration is hidden for the overview camera.
- Technical details, health, history, timelapses, and the full daily report are collapsed by default.

## Deployment boundary

Maintenance 9E is app-side. It does not modify Raspberry Pi services, camera capture configuration, Publisher 2.7.3, or Vercel function routing.
