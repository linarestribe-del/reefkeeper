# Reef Keeper Maintenance 9E.1 Release Manifest

Release: **v4.3.54 Maintenance 9E.1 — Observer Follow-up Corrections**

Baseline: **v4.3.53 Maintenance 9E**

## Scope

Maintenance 9E.1 is a narrow app-side follow-up. It does not change Raspberry Pi Publisher 2.7.3, camera capture services, filter-roll calibration files, remote storage contracts, or the Vercel function count.

## Alert lifecycle corrections

- Reviewed alerts are retained in an in-memory fallback as well as device storage, so the active card disappears immediately even if iOS local storage is temporarily unavailable.
- Marking an alert reviewed immediately removes it from **Needs attention**, updates the badge and count, and stores it under collapsed **Reviewed history**.
- A reviewed system condition no longer rearms merely because a previous-active cache is absent.
- A system condition rearms only after a complete Observer feed confirms that it cleared and a later feed reports it again.

## Maintenance-scene presentation

- A persistent sump-view difference caused only by the local scene monitor is displayed as **Advisory**, not a generic equipment **Attention** state.
- The live camera card and Observer Tools explain the exact action: inspect the current image and mark the alert reviewed when skimmer, GFO reactor, hose, lid, or cord movement is expected after maintenance.
- The interface explicitly states that no exact image reset is required.
- Camera movement, obstruction, capture, publishing, storage, power, and other real system warnings remain Attention or Offline and are not downgraded.

## Filter-roll wording

- A stale or rejected tracking sequence now gives an actionable message with the date of the last accepted camera reading.
- The message explains that the current estimate remains anchored to the manual baseline and should not be used for replacement planning until camera tracking is recalibrated.

## Files changed

- `index.html`
- `observer.js`
- `api/observer-alerts.js`
- `filter-roll-engine.js`
- `filter-roll-status.js`
- `app.css`
- `css/app.css`
- `package.json`
- `package-lock.json`
- regression tests, release documentation, and checksums

## Explicitly unchanged

- `connector/observer-publisher.py` remains Publisher **2.7.3**.
- No Raspberry Pi command or configuration change is required.
- No Vercel function was added.
- The future zone-based, maintenance-tolerant Pi scene monitor remains reserved for Maintenance 9F.
