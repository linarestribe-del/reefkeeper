# Changelog

## v4.1.2 — Cloud Telemetry Reader

- Home Live Telemetry now requests the latest snapshot from `/api/telemetry` through `ReefKeeperApexBridge`.
- Cloud telemetry is enabled by default with `/api/telemetry` as the default endpoint.
- The bridge silently refreshes cloud telemetry on load and periodically while the app is open.
- Imported cloud snapshots update the shared Apex telemetry store, Reef Brain, Home, and Timeline hooks.
- Home now shows a clearer “checking cloud telemetry” state instead of only asking for manual import.

## v4.1.1 — Connector Push Foundation

- Added `/api/telemetry` endpoint for connector push telemetry.
- Added local Apex connector script.
- Added cloud connector settings to Apex Integration.


## v4.2.0 – Stable Telemetry Hub
- Added `telemetry-config.js` as the canonical telemetry endpoint config.
- Updated Cloud Telemetry Reader so preview branches can read from one stable telemetry hub.
- Updated connector to support `REEF_KEEPER_TELEMETRY_ENDPOINT` directly.
- Clarified connector setup so it no longer needs to change for every preview deployment.
