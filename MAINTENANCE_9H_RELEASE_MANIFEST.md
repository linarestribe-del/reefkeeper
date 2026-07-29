# Reef Keeper v4.3.59 — Maintenance 9H

## Scope

Maintenance 9H is an app-only Vercel usage-saver follow-up. It aligns the Observer user interface with the Raspberry Pi change that keeps local captures every 5 minutes while publishing to Vercel every 15 minutes.

## Included changes

- Adds explicit Observer wording: local capture every 5 minutes, cloud publish every 15 minutes.
- Extends app-side remote-publish and capture freshness thresholds from 15 minutes to 25 minutes, with a 90-minute offline threshold.
- Updates Remote Publishing health text so normal data-saver spacing does not look like a failure.
- Adds the data-saver schedule to Observer diagnostics.
- Bumps cache/version text to v4.3.59 Maintenance 9H.

## Not changed

- Raspberry Pi capture timers remain unchanged.
- Raspberry Pi publisher remains 2.8.0.
- Timelapse Builder remains 1.2.
- Vercel function count remains 12/12.
