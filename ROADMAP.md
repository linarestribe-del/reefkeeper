# Reef Keeper Roadmap

**Last updated:** July 17, 2026

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

## Build 1B — Structured Context and Evidence

- [ ] Add normalized tank-observation and evidence-record modules.
- [ ] Wrap existing parameter, action, reminder, inventory, Tank Memory, Reef Library, and Apex inputs.
- [ ] Add data freshness and quality labels.
- [ ] Add source class, publication/review dates, status, and topic metadata to Reef Library records.
- [ ] Preserve all legacy data and backup compatibility.
- [ ] Add deterministic fixtures and context-selection tests.

## Build 1C — Decision, Skeptic, Confidence, and Journal

- [ ] Add structured server response contract.
- [ ] Separate observation, inference, recommendation, monitoring, and confidence.
- [ ] Add alternative-explanation skeptic pass.
- [ ] Enforce confidence caps and conservative action ladder.
- [ ] Add opt-in Decision Journal records and outcome dates.
- [ ] Preserve existing chat modes and reminder proposals.

## Build 2 — Graphs, Trends, and ICP

- [ ] Persist Apex telemetry history without overwhelming storage.
- [ ] Add 24-hour, 7-day, 30-day, 90-day, 1-year, and all-history views.
- [ ] Add temperature, pH, ORP, and supported Apex state graphs.
- [ ] Add manual chemistry trend graphs.
- [ ] Add maintenance, media, dosing, treatment, and calibration event overlays.
- [ ] Display gaps and data completeness honestly.
- [ ] Add trend calculations and AI annotations.
- [ ] Add ICP report import, user verification, element history, and comparisons.
- [ ] Connect all trend findings to the Evidence Engine.

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
