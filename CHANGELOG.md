# Reef Keeper Changelog

## v4.0.3 — Apex Telemetry Test

### Goal
Make the Apex telemetry test section visible and testable from the real Apex Integration screen.

### Changed
- `index.html`
  - Updates cache-busting script/style versions to v4.0.3.
  - Updates the displayed version label to Apex Telemetry Test.
- `apex-connect.js`
  - Embeds the telemetry test panel directly in the Apex Integration render path.
  - Calls the bridge renderer after each Apex settings render so the panel is not lost when the page re-renders.
  - Updates Apex copy from v4.0.2 bridge scaffold to v4.0.3 telemetry test.
- `apex-bridge.js`
  - Renames the panel to Telemetry Test.
  - Renames the import button to Import Telemetry.
  - Keeps sample payload loading, manual JSON import, local telemetry storage, and Reef Brain refresh.

### Test Checklist
- [ ] More → Apex Integration opens.
- [ ] Telemetry Test card is visible below the Fusion/Local setup controls.
- [ ] Load Sample fills the JSON payload box.
- [ ] Import Telemetry saves the sample.
- [ ] Probe tiles display temperature, pH, ORP, and salinity after import.
- [ ] Refresh the app and confirm the latest telemetry remains visible.
- [ ] Fusion and Local / Bridge mode switching still works.
- [ ] Home, Reef Brain, Ask AI, and Timeline still load normally.
- [ ] Dark mode is readable.

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
