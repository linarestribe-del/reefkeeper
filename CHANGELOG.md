# Reef Keeper Changelog

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
