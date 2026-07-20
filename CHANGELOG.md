# Reef Keeper Changelog

## v4.3.17 — Build 2F: Aquarium Observer Publishing Bridge

### Added

- Added authenticated `/api/observer-publish` uploads for the Raspberry Pi's current JPEG and sanitized capture status.
- Added private Vercel Blob storage for one replaceable current image and one current status record.
- Added `/api/observer-image` to stream the private current image through the Reef Keeper origin without exposing the Blob URL.
- Added a dependency-free Raspberry Pi publisher script at `connector/observer-publisher.py`.
- Added storage-capacity reporting, upload-size validation, JPEG signature validation, constant-time token comparison, and publishing regression tests.

### Privacy and architecture

- Full-resolution archives remain only on the Raspberry Pi's ext4 drive.
- Vercel receives only the current selected JPEG and a strict allowlist of status fields.
- Camera credentials, RTSP URLs, local paths, and home-network addresses are excluded from the payload and stored record.
- The current cloud image is stored in a private Blob store and is delivered only through the same-origin app endpoint.
- No router port forwarding or direct inbound connection to the Raspberry Pi is required.

## v4.3.16 — Build 2E: Aquarium Observer Interface

### Added

- Added an Aquarium Observer preview to AI Vision and a dedicated Observer status page.
- Added remote-ready status, capture-age, camera, stream, image-size, interval, and archive-storage fields.
- Added safe offline, stale, and not-yet-connected states instead of showing fabricated camera data.
- Added an Analyze Latest Capture action that reuses the tested Ask AI image-resize and attachment pipeline when a selected remote image reference becomes available.
- Added `/api/observer-status` as an authenticated, metadata-only Pi bridge contract backed by Vercel KV when configured.
- Added automated Observer UI and privacy regression tests.

### Privacy and architecture

- Full-resolution camera archives remain on the Raspberry Pi drive.
- The metadata endpoint rejects embedded image bytes, credentials, RTSP URLs, local file paths, and home-network addresses.
- Selected cloud images must be supplied later as HTTPS object-storage references.
- This build does not expose the Pi or camera directly to the internet.

## v4.3.15 — Build 2D: Ask AI Image Input

### Fixed

- Ask AI now sends the actual attached image pixels to the Responses API instead of sending only the filename or a text placeholder.
- Camera and photo-library uploads are resized and converted to JPEG before sending, with a compact preview confirming the image is ready.
- A photo can be sent without typing a question; Reef Keeper supplies a conservative general reef-photo analysis prompt.
- Image data is used only for the current request and is not stored inside chat-history localStorage.
- The existing AI Vision fallback call can now pass image attachments through the same Ask AI pipeline.

### Safety and compatibility

- Existing PDF and text-document attachment behavior remains unchanged.
- Unsupported or oversized images are rejected with a clear error before an OpenAI request is made.
- Image requests use `OPENAI_MODEL_VISION` when configured, while text-only model selection remains unchanged.
- No saved-data migration, navigation, Parameter Log, graph, Apex, or explainability changes.
- Added an automated multimodal request regression test.

## v4.3.14 — Build 2C: In-Answer Explainability

### Added

- Added `ai/explainability.js`, a deterministic presentation layer for Evidence and Decision Engine results.
- Added a compact Evidence Review directly inside each new Ask AI response when tank context is enabled.
- The review shows calculated confidence, strongest evidence, missing or stale data, Skeptic Layer notes, and the permitted action ceiling.
- Saved conversations retain the optional explainability record for new assistant messages.
- Added automated explainability and release-regression tests.

### Safety and compatibility

- No separate Why button or expandable control.
- No core asset renaming; production remains on `app.js` and `css/app.css`.
- No navigation, Apex, parameter-log, or existing saved-data migration changes.
- Chat history is sanitized to `role` and `content` before being sent to the API, so local explainability metadata is never sent as an unsupported message field.

## Unreleased – Build 2B.1: Touch Drag Repair

- Fixed iPhone parameter-chart dragging so pointer movement updates the inspected reading while a finger remains on the chart.
- Added pointer capture and pointer end/cancel cleanup so dragging remains reliable across the graph surface.
- Preserved vertical page scrolling through the existing `touch-action: pan-y` chart rule.
- No changes to Ask AI, navigation, saved data, Apex integration, or parameter analytics.

## v4.3.12 — Build 2B: Graph Display and Touch Inspection

### Added

- Added `ai/trend-chart.js`, a deterministic presentation model for time-scaled parameter charts.
- Added explicit working-range bands, readable value-grid lines, improved date labels, and maintenance-event markers.
- Added touch, mouse, and keyboard inspection of individual readings with date, value, change from the prior reading, and nearby logged events.
- Added automated chart-model and release regression tests.

### Updated

- Changed graph spacing from equal-by-reading to proportional-by-time so long gaps are visually honest.
- Improved the latest-reading highlight, chart legend, dark-mode presentation, and compact iPhone layout.
- Retained the Build 2A analytics panel and non-causation language for event correlations.

### Safety and compatibility

- No Ask AI, navigation, Apex, or saved-data schema changes.
- No core asset renaming; production remains on `app.js` and `css/app.css`.
- Existing manual logs, maintenance records, reminders, and completed history remain unchanged.

## v4.3.11 — Build 2A: Parameter Analytics

### Added

- Added `ai/trend-engine.js`, a deterministic parameter-analysis module.
- Added rising, falling, stable, oscillating, and insufficient-data classification.
- Added rate-of-change, target-range status, trend strength, cautious directional estimates, and rapid-change warnings.
- Added parameter-relevant maintenance and completed-task correlation with a clear non-causation disclaimer.
- Added automated Trend Engine and release regression tests.

### Updated

- Expanded the existing Parameter Trends card with a compact analytics summary while retaining the current SVG chart and saved-log format.
- Kept the production asset names `app.js` and `css/app.css`; only cache query labels changed.
- Left Ask AI, Decision Engine behavior, and chat UI unchanged.

### Safety and compatibility

- No localStorage schema changes.
- No existing parameter, maintenance, reminder, or completed-history records are rewritten.
- No Why button, experimental chat renderer, or Build 2 asset renaming is included.
- The Parameter Log navigation repair remains covered by regression tests.

## Unreleased — Build 1C: Decision Engine

- Added deterministic evidence confidence scoring based on relevance-weighted evidence, freshness, completeness, conflicts, and data-quality limitations.
- Added question-specific missing and stale measurement detection.
- Added a Skeptic Layer that surfaces conflicts, limitations, alternative-cause requirements, and overconfidence risk.
- Added conservative action ceilings so weak evidence leads to observation or verification rather than aggressive intervention.
- Integrated the decision review into Ask AI while preserving Build 1B as a safe fallback.
- Added automated Decision Engine and navigation regression tests.

# Reef Keeper Changelog

## v4.3.10 — Build 1B: Structured Context and Evidence

### Added

- Added `ai/evidence-engine.js`, a dependency-free normalized context and evidence layer.
- Added typed observations for manual chemistry, Apex probes/outlet states, actions, completed tasks, reminders, inventory, equipment, Tank Knowledge, and Reef Library records.
- Added source reliability, freshness, authority, applicability, data quality, effective evidence weights, current-state selection, derived parameter trends, and explicit conflicts.
- Added deterministic evidence-engine and Parameter Log navigation regression tests through `npm test`.

### Updated

- Ask AI now receives a bounded structured evidence contract in addition to the legacy context during the migration period.
- Reef Library records migrate in place to schema 1.0 metadata: source class, publisher/authors, publication/review dates, status, topics, trust, equipment/firmware scope, and supersession.
- Added a Vercel static route for `/ai/` so the evidence module is served as JavaScript instead of falling through to `index.html`.
- Bumped the package version to 4.3.10 and cache-bumped the evidence/app scripts.

### Safety and compatibility

- Existing local records are not deleted or rewritten by the evidence collector.
- The legacy Ask AI context remains the fallback if structured normalization fails.
- The Parameter Log direct-navigation repair remains intact and is now tested.

## Unreleased — Build 1A: AI Architecture Foundation

### Added

- Added `AI_ENGINE.md` as the governing specification for Reef Keeper's evidence-based AI architecture.
- Defined the AI Constitution, evidence hierarchy, freshness/review rules, Knowledge Graph, Digital Twin, Decision Engine, Skeptic Layer, confidence caps, Decision Journal, Risk Engine, Learning Engine, and bounded Simulation Engine.
- Defined how Apex graphs, manual parameter trends, ICP results, display-tank camera observations, and sump-camera observations will feed one Evidence Engine.
- Defined hybrid camera storage: full-resolution local Raspberry Pi/USB SSD archive plus selected private cloud thumbnails and incident images.
- Defined staged Builds 1B through 5.

### Updated

- Replaced the older high-level architecture outline with current runtime and target v5 architecture.
- Expanded the roadmap into independently deployable builds.
- Expanded development rules for evidence quality, freshness, uncertainty, migration, vision, graphs, and read-only equipment boundaries.
- Expanded the test plan with deterministic AI fixtures and future graph, ICP, and camera acceptance tests.

### Runtime impact

- Documentation only.
- No JavaScript, HTML, CSS, API, connector, Vercel configuration, or package-version changes.

## v4.3.4 — Auto Telemetry Hub

### Fixed

- Removed the need to maintain `telemetry-config.js` for each preview branch.
- Production reads telemetry from its own `/api/telemetry` endpoint.
- Preview deployments and local testing automatically read telemetry from `https://reefkeeper.vercel.app/api/telemetry`.
- Prevents stale preview URLs from breaking Live Telemetry.

### Notes

- Keep the Mac Apex connector pointed at `https://reefkeeper.vercel.app`.
- `telemetry-config.js` is no longer required for this release.
