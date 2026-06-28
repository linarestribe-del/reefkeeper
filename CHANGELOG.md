# Reef Keeper Changelog

## v4.0.2 — Apex Live Data Bridge

### Goal
Add the first safe read-only Apex telemetry bridge path without relying on direct browser-to-Apex access or Fusion credentials.

### Changed
- `index.html`
  - Updates Apex Integration wording to v4.0.2.
  - Loads the new `apex-bridge.js` module.
- `apex-connect.js`
  - Updates Apex setup copy for the live data bridge phase.
  - Keeps Fusion mode as a safe profile and Local/Bridge mode as the telemetry path.
- `apex-bridge.js`
  - Adds a local bridge payload importer.
  - Supports read-only Apex telemetry JSON: temperature, pH, ORP, salinity, outlets, and alarms.
  - Stores latest bridge snapshot in local storage.
  - Stores recent bridge history locally.
  - Exposes bridge telemetry to Reef Brain.
  - Includes a sample payload loader for testing.
- `reef-brain.js`
  - Reads latest Apex bridge telemetry.
  - Adds Apex telemetry to Reef Brain snapshots and AI context lines.
- `css/app.css`
  - Adds Apex bridge card, probe tiles, payload box, and dark mode styling.

### Test Checklist
- [ ] More → Apex Integration opens.
- [ ] Fusion mode still saves.
- [ ] Local / Bridge mode still saves.
- [ ] Live Data Bridge card appears in Apex Integration.
- [ ] Load Sample fills the payload box.
- [ ] Import Bridge Payload saves the sample.
- [ ] Probe tiles display temperature, pH, ORP, and salinity.
- [ ] Reef Brain / Home still loads after import.
- [ ] Ask AI still works and can reference latest Apex bridge telemetry.
- [ ] Dark mode remains readable.

### Notes
This is not full automatic Apex sync yet. It is the bridge schema and local telemetry ingestion step. A later release can add a small local service or Home Assistant bridge that sends these payloads automatically.
