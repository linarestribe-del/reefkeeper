# Reef Keeper v4.3.60 — Maintenance 9I

Maintenance 9I is a focused filter-roll reliability polish over v4.3.59 / 9H.

## Scope

- App version bump to v4.3.60.
- Filter-roll status engine version bump to 9I.
- Filter-roll card now presents rejected scheduled attempts as **Holding last good reading** instead of a stale-measurement warning.
- Replacement forecasts are paused when the latest scheduled camera attempt was rejected and accepted history is not yet strong enough.
- Latest rejected camera attempt is exposed in the deterministic status object for clearer UI wording.
- Estimate source wording now says **Last accepted camera measurement** when appropriate.
- Raspberry Pi Observer Publisher upgraded from 2.8.0 to 2.8.1.
- Publisher 2.8.1 preserves combined rejection causes, including low detector confidence and large-radius decrease confirmation requirements.
- Includes rollback-ready installer `connector/install-observer-publisher-2.8.1.sh`.

## Not changed

- Vercel function count remains unchanged.
- Local capture stays every 5 minutes.
- Cloud publishing remains on the 15-minute data-saver timer override.
- Timelapse Builder remains 1.2.
- Return-chamber timelapse support remains active and waiting for enough history if not yet generated.

## Raspberry Pi step

Deploy the web app first. Then run the Publisher 2.8.1 installer from the deployed app origin.
