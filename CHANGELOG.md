# Reef Keeper Changelog

## v4.1.1 — Connector Push Foundation

### Goal
Allow a small local connector running at home to push Apex telemetry to Reef Keeper Cloud so the app can retrieve telemetry away from home.

### Changed
- `api/telemetry.js`
  - Adds a Vercel API endpoint for telemetry POST/GET.
  - Supports durable storage through Vercel KV / Upstash REST environment variables.
  - Supports temporary server-memory fallback for quick testing when KV is not configured.
  - Supports write/read token protection through environment variables.
- `connector/apex-connector.mjs`
  - Adds a Node 18+ local Apex connector.
  - Reads local Apex `/rest/status`.
  - Normalizes probes, outlets, alarms, and safe system details.
  - Pushes telemetry to Reef Keeper Cloud.
  - Supports username/password Basic auth or an Apex session cookie fallback.
- `connector/README.md`
  - Adds setup instructions for Vercel KV, Vercel tokens, and running the connector from a Mac/Raspberry Pi.
- `apex-bridge.js`
  - Adds Connector Push settings to the Telemetry Test card.
  - Adds Fetch Cloud Telemetry support.
  - Auto-fetches cloud telemetry when enabled.
- `css/app.css`
  - Adds styling for the Connector Push card.

### Test Checklist
- [ ] Deploy branch with `api/telemetry.js` and connector files.
- [ ] Optional: configure Vercel KV and `REEF_TELEMETRY_WRITE_TOKEN`.
- [ ] Run connector once with `node connector/apex-connector.mjs --once`.
- [ ] More → Apex Integration → Fetch Cloud Telemetry.
- [ ] Home Live Telemetry updates from cloud data.
- [ ] Reef Timeline shows telemetry event.
- [ ] Ask AI includes Apex telemetry context.
- [ ] Dark mode remains readable.

## v4.1.0 — Native Apex Driver

### Goal
Connect Reef Keeper to the native local Apex LAN REST status schema instead of relying only on generic bridge payloads.

### Changed
- `apex-connect.js`
  - Updates Apex Integration to target the local Apex `/rest/status` endpoint.
  - Changes Local mode into a native Apex LAN driver path with bridge fallback.
  - `Fetch /rest/status` now imports a successful Apex response into Reef Keeper telemetry.
  - Keeps Fusion mode safe: no Fusion password is requested or tested.
- `apex-bridge.js`
  - Upgrades telemetry normalization to v4.1.0.
  - Adds a native Apex `/rest/status` parser for `system`, `nstat`, `inputs`, `outputs`, modules, outlets, alerts, and leak sensors.
  - Normalizes Apex probe values: temperature, pH, ORP, and salinity/conductivity when present.
  - Normalizes Apex outlet states such as `AON`, `AOF`, `ON`, and `OFF`.
  - Adds an Apex sample payload matching the discovered AC6L schema.
- `reef-brain.js`
  - Updates wording from Apex bridge to Apex telemetry where appropriate.
- `index.html`
  - Updates Apex Integration labels and script versions for v4.1.0.
- `css/app.css`
  - Adds native Apex summary and outlet-preview styling.

### Test Checklist
- [ ] More → Apex Integration opens.
- [ ] Fusion mode still saves and does not ask for Fusion password.
- [ ] Local mode shows Native Apex LAN wording.
- [ ] Enter `http://apex.local` or Apex IP and press Fetch `/rest/status`.
- [ ] If browser fetch is blocked, paste the `/rest/status` JSON into Telemetry Test and import.
- [ ] Probe tiles show Temp, pH, ORP, and salinity if present.
- [ ] Outlet preview shows Apex outlet names and states.
- [ ] Home Live Telemetry updates.
- [ ] Reef Brain confidence/score still works.
- [ ] Reef Timeline records telemetry.
- [ ] Ask AI still works.
- [ ] Dark mode remains readable.

## v4.0.5 — Live Reef Brain

### Goal
Move Reef Keeper from showing live values to interpreting them with Reef Brain.

### Changed
- `reef-brain.js`
  - Upgrades Reef Brain to v4.0.5.
  - Adds Reef Brain confidence scoring based on recent parameters, telemetry, photos, maintenance, and history depth.
  - Adds live telemetry interpretation for temperature, pH, ORP, salinity, and active Apex alarms.
  - Adds confidence and telemetry interpretation to AI context and Daily Reef Assistant output.
- `index.html`
  - Adds Home score explanation panel: Why this score?, positive factors, watch factors, and confidence.
  - Updates Daily Reef Assistant summary to include Reef Brain confidence.
  - Updates Home Live Telemetry to show interpreted probe status instead of raw values only.
- `app.js`
  - Updates AI Tank Dashboard to reuse Reef Brain score explanation and confidence.
- `css/app.css`
  - Adds styling for confidence cards, score factors, and interpreted telemetry tiles.

### Test Checklist
- [ ] Home loads.
- [ ] Tank Score still shows one score only.
- [ ] Home shows Why this score? and confidence.
- [ ] Load Apex sample telemetry.
- [ ] Home Live Telemetry shows interpreted probe tiles.
- [ ] AI Tank Dashboard shows confidence and score reasons.
- [ ] Ask AI still works and receives Reef Brain context.
- [ ] Reef Timeline still shows telemetry events.
- [ ] Dark mode remains readable.

## v4.0.4 — Live Telemetry

### Goal
Make the Apex/Bridge telemetry test actually feed Reef Keeper instead of only storing a configuration profile.

### Changed
- `apex-bridge.js`
  - Upgrades the bridge to v4.0.4.
  - Importing telemetry now saves the latest snapshot and history.
  - Load Sample now imports sample telemetry immediately.
  - Adds bridge status, probe count, outlet count, alarm count, and outlet summary.
  - Refreshes Home, Reef Brain, and Reef Timeline after import.
- `index.html`
  - Adds a Home → Live Telemetry card.
  - Shows temperature, pH, ORP, salinity, outlet summary, and last update age.
- `reef-brain.js`
  - Consumes Apex bridge telemetry in Reef Brain.
  - Adds live telemetry to AI context, AI Watching, Daily Reef Assistant, and score guardrails.
- `reef-timeline.js`
  - Adds Apex telemetry imports as Timeline events.
- `css/app.css`
  - Adds styling for Home live telemetry and Apex bridge status.

### Test Checklist
- [ ] More → Apex Integration opens.
- [ ] Telemetry Test card appears.
- [ ] Load Sample immediately shows probe values.
- [ ] Import Telemetry accepts valid JSON and rejects invalid JSON.
- [ ] Home → Live Telemetry shows imported values.
- [ ] Reef Timeline shows Apex telemetry events.
- [ ] Ask AI has latest telemetry context.
- [ ] Dark mode remains readable.

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
