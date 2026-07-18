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
