## Maintenance 9A — Integration Core — Candidate v4.3.47

- [x] Add a shared structured tank-event stream with stable IDs and duplicate protection.
- [x] Mirror parameter logs, maintenance actions, and completed tasks without replacing legacy storage.
- [x] Feed Home recent changes, Reef Timeline, reports, backups, and Ask AI from the shared stream.
- [x] Add structured Connected equipment and Connected action fields to Maintenance.
- [x] Start and close Observer filter-roll cycles from logged fleece replacements.
- [x] Add an Observer filter-roll learning status card and a low-frequency measurement/forecast API.
- [x] Keep Vercel at 12/12 functions and make no Pi-side changes.
- [ ] Deploy and verify the connected maintenance workflow on the primary iPhone app.
- [ ] Add the overview-camera roll detector in a later isolated Observer build.

## Maintenance 8D — Dual-Camera Observer — Candidate v4.3.46

- [x] Preserve the verified C120 overview capture and existing archive.
- [x] Add a separate local return-chamber capture path and staggered timer.
- [x] Add Publisher 2.5 dual-camera R2 publishing and independent health.
- [x] Add an Overview / Return Chamber selector and camera-specific diagnostics.
- [x] Preserve overview history, daily summaries, alerts, and timelapses.
- [x] Keep Vercel at 12/12 functions and avoid per-frame AI.
- [ ] Complete the guarded Publisher 2.5 installation on the Pi.
- [ ] Confirm both current images and health records on iPhone.
- [ ] Calibrate the return-chamber water-level region.

## Maintenance 8C — Local Sump Monitoring — Candidate v4.3.45

- [x] Add local image-quality and obstruction screening without OpenAI.
- [x] Add lighting-specific stable-scene learning and repeated camera-shift/scene-change confirmation.
- [x] Add calibration-ready water-level tracking with warning and urgent thresholds.
- [x] Add compact Observer UI, diagnostics, schema normalization, and deterministic alert mappings.
- [x] Keep Vercel at 12/12 functions and preserve R2, daily summaries, and timelapses.
- [ ] Complete controlled Publisher 2.4 installation on the Pi.
- [ ] Select and calibrate the visible sump water-level region from a current image.
- [ ] Observe at least one day of stable local metrics before tuning thresholds.

## Maintenance 8B — Observer Monitoring Safeguards — Candidate v4.3.44

- [x] Bounded daily-summary retries.
- [x] Deterministic system alerts without per-frame AI.
- [x] Daily monitoring status in Observer Health.
- [ ] Deploy the web overlay and activate publisher 2.3 with a controlled Pi service test.

# Reef Keeper Roadmap

**Last updated:** July 24, 2026

## Current Stable Line — v4.3.x

- Live Apex telemetry through the connector and telemetry hub.
- Parameter, maintenance, reminder, livestock, equipment, Tank Memory, Reef Library, Timeline, and AI Vision workflows.
- Ask AI context assembled from local app data and live Apex status.
- Current priority: preserve stability while migrating intelligence out of ad hoc prompt assembly.

## Maintenance 6F — Stable Post-Cleanup Checkpoint — Complete in v4.3.40

- [x] Preserve v4.3.39 runtime behavior while versioning a clean recovery baseline.
- [x] Add automated JavaScript and inline-script syntax checks.
- [x] Add duplicate top-level browser function detection.
- [x] Add literal DOM-reference integrity checks with documented dynamic/optional elements.
- [x] Lock prior layout, navigation, handler, render, snapshot, and shared-helper cleanup regressions into the standard test command.
- [x] Update architecture, rollback, release, checksum, and test documentation.
- [x] Complete the two isolated UI fixes supplied by the user in v4.3.41 / Maintenance 7A.
- [x] Migrate Aquarium Observer remote storage from paused Vercel Blob to private Cloudflare R2.
- [x] Complete live R2 activation and re-enable the Pi publisher timer after a successful manual publish.


## Maintenance 7A — Mobile Header and Ask AI Positioning — Complete in v4.3.41

- [x] Let the Reef Keeper title/tagline scroll with the page.
- [x] Remove the reserved solid iPhone status-bar strip by extending the reef background through the safe area.
- [x] Keep the bottom navigation fixed and independently tappable.
- [x] Position completed Ask AI responses at the beginning of the new answer.
- [x] Add regression coverage without changing storage, APIs, Apex, Observer, or Pi services.



## Maintenance 8A — Observer R2 Migration — Complete in v4.3.43

- Replaces Vercel Blob with private Cloudflare R2 storage.
- Preserves existing Observer APIs and Pi publisher protocol.
- Live R2 authentication, manual publishing, automatic publishing, and current-image delivery were verified.

## Maintenance 7B — iPhone Status Canvas — Complete in v4.3.42

- [x] Paint the reef artwork on the root page canvas used by the iPhone standalone status area.
- [x] Remove the duplicate image from `.ocean-bg` so the artwork does not restart below the status area.
- [x] Add a matching status/theme fallback color.
- [x] Preserve Maintenance 7A header scrolling and Ask AI answer positioning.

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

## Build 2B — Graph Display and Event Overlays — Complete in v4.3.12

- [x] Add explicit target bands and maintenance markers to manual chemistry graphs.
- [x] Use proportional date spacing so gaps between tests remain visually honest.
- [x] Improve touch, mouse, and keyboard inspection of individual readings and nearby events.
- [x] Keep graph calculations deterministic and independently testable.
- [ ] Add selectable time windows later when sufficient manual history makes them useful.

## Build 2C — In-Answer Explainability — Complete in v4.3.14

- [x] Show deterministic confidence inside new tank-context Ask AI responses.
- [x] Show the strongest evidence used by the Decision Engine.
- [x] Identify missing or stale evidence and Skeptic Layer limitations.
- [x] Show the conservative action ceiling directly inside the answer.
- [x] Avoid a separate Why button, asset renaming, navigation changes, and saved-data migration.

## Build 2D — Apex History and ICP

- [ ] Persist Apex telemetry history without overwhelming storage.
- [ ] Add 24-hour, 7-day, 30-day, 90-day, 1-year, and all-history views.
- [ ] Add temperature, pH, ORP, and supported Apex state graphs.
- [ ] Add ICP report import, user verification, element history, and comparisons.
- [ ] Connect trend findings to the Evidence Engine.

## Later Explainability UI

- [x] Begin with a normal in-answer evidence section after the parameter and chat paths proved stable.
- [ ] Consider optional progressive disclosure only after the in-answer review has been used successfully in production.

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
