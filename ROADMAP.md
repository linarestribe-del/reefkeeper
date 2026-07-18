# Reef Keeper Roadmap

**Last updated:** July 18, 2026

## Current Stable Line — v4.3.x

- Live Apex telemetry through the connector and telemetry hub.
- Parameter, maintenance, reminder, livestock, equipment, Tank Memory, Reef Library, Timeline, and AI Vision workflows.
- Ask AI context assembled from local app data and live Apex status.
- Current priority: preserve stability while migrating intelligence out of ad hoc prompt assembly.

## Build 1A — AI Architecture Foundation — Complete in this package

- [x] Add `AI_ENGINE.md` as the governing AI specification.
- [x] Define the AI Constitution and evidence hierarchy.
- [x] Define freshness, review, and supersession rules.
- [x] Define Digital Twin, Evidence Engine, Decision Engine, Skeptic Layer, confidence, and Decision Journal contracts.
- [x] Define Graph/ICP and Aquarium Observer integration requirements.
- [x] Update architecture, development guidelines, test plan, and changelog.
- [x] Make no runtime changes in this documentation build.

## Build 1B — Structured Context and Evidence — Complete in v4.3.10

- [x] Add normalized tank-observation and evidence-record module in `ai/evidence-engine.js`.
- [x] Wrap existing parameter, action, completed-task, reminder, inventory, equipment, Tank Knowledge, Reef Library, and Apex inputs.
- [x] Add source, timestamp, freshness, authority, reliability, and data-quality labels.
- [x] Add current-state selection, trend evidence, stale-data warnings, and explicit live/manual pH conflicts.
- [x] Add source class, publication/review dates, status, topics, trust weight, equipment/firmware scope, and supersession metadata to Reef Library records.
- [x] Preserve legacy data and backup compatibility through in-place metadata migration.
- [x] Keep the legacy context path as a fallback during migration.
- [x] Add deterministic evidence and Parameter Log navigation regression tests.

## Build 1C — Decision, Skeptic, and Confidence — Complete

- [x] Add deterministic evidence review before Ask AI.
- [x] Detect missing, stale, and conflicting evidence.
- [x] Add alternative-explanation skeptic checks.
- [x] Enforce confidence caps and a conservative action ladder.
- [x] Preserve existing chat modes and the Build 1B fallback path.
- [ ] Add opt-in Decision Journal records and outcome dates in a later isolated build.

## Build 2A — Manual Parameter Analytics — Complete in v4.3.11

- [x] Add deterministic trend calculations for manual chemistry logs.
- [x] Classify rising, falling, stable, oscillating, and insufficient-data patterns.
- [x] Show rate of change, target-range status, trend strength, and cautious estimates.
- [x] Correlate relevant maintenance/completed events without claiming causation.
- [x] Preserve the existing chart, log storage, chat UI, and core asset filenames.

## Build 2B — Graph Display and Event Overlays

- [ ] Add explicit target bands and maintenance markers to manual chemistry graphs.
- [ ] Add selectable time windows and honest gap display.
- [ ] Improve touch inspection of individual readings and events.
- [ ] Keep analytics deterministic and independently testable.

## Build 2C — Apex History and ICP

- [ ] Persist Apex telemetry history without overwhelming storage.
- [ ] Add 24-hour, 7-day, 30-day, 90-day, 1-year, and all-history views.
- [ ] Add temperature, pH, ORP, and supported Apex state graphs.
- [ ] Add ICP report import, user verification, element history, and comparisons.
- [ ] Connect trend findings to the Evidence Engine.

## Later Explainability UI

- [ ] Add recommendation explanations only after the parameter and chat paths are independently stable.
- [ ] Begin with a normal in-answer evidence section before adding expandable controls.

## Build 3 — Aquarium Observer

- [ ] Add high-resolution display-tank camera.
- [ ] Add sump camera.
- [ ] Store full-resolution routine images on a Raspberry Pi USB SSD.
- [ ] Upload selected thumbnails, alerts, incidents, daily references, and favorites to private cloud object storage.
- [ ] Add configurable capture and retention schedules.
- [ ] Track image quality, camera position, and lighting comparability.
- [ ] Normalize visual observations for the Decision Engine.
- [ ] Add camera history to the Timeline and incident reports.

## Build 4 — Risk and Prediction

- [ ] Detect interacting weak signals and rate-of-change risks.
- [ ] Predict likely media depletion and parameter drift using tank history.
- [ ] Deduplicate alerts and track resolution.
- [ ] Add bounded forecasts with uncertainty.
- [ ] Generate incident reports for significant events.

## Build 5 — Learning and Outcome Review

- [ ] Ask whether accepted recommendations were implemented.
- [ ] Record improved, unchanged, worsened, mixed, unknown, or not-implemented outcomes.
- [ ] Capture confounding changes.
- [ ] Increase tank-specific evidence only after cautious review.
- [ ] Add monthly decision-quality and tank-pattern reports.

## Later — Bounded Simulation

- [ ] Water-change and dosing calculations.
- [ ] Trend projections and staged what-if comparisons.
- [ ] Explicit assumptions and uncertainty ranges.
- [ ] No exact biological predictions or direct equipment control.

## Project Guardrails

- Complete the planned cleanup/refactoring pass before major UI expansion.
- Keep each build independently deployable and reversible.
- Do not mix large refactors with unrelated visible features.
- Do not add a feature unless it improves observation, evidence, decision safety, or learning.
