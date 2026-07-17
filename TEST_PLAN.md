# Reef Keeper Test Plan

**Last updated:** July 17, 2026

## Standard Preview Checklist

Run this checklist before merging every feature branch.

### Home

- [ ] Home loads without console errors.
- [ ] Only one Tank Score is visible.
- [ ] Today's Reef Brief renders.
- [ ] Quick actions route correctly.
- [ ] Live Telemetry card handles no-data state.
- [ ] Live Telemetry card handles valid imported/bridge data.

### My Tank

- [ ] My Tank opens.
- [ ] Fish & Livestock opens catalog.
- [ ] Coral Inventory opens catalog.
- [ ] Equipment Manager opens.
- [ ] Parameters Log opens.

### Apex Integration

- [ ] More → Apex Integration opens.
- [ ] Fusion mode saves.
- [ ] Local/Bridge mode saves.
- [ ] Telemetry Test card appears.
- [ ] Load Sample works.
- [ ] Import Telemetry accepts valid JSON.
- [ ] Invalid JSON shows an error.
- [ ] Clear telemetry works.
- [ ] Stale telemetry is not represented as current.

### Reef Brain / Ask AI

- [ ] Daily Reef Assistant renders.
- [ ] Tank Score does not duplicate.
- [ ] Ask AI receives tank context when enabled.
- [ ] Ask AI excludes tank context when disabled.
- [ ] Quick, Balanced, Deep, and Simple modes work.
- [ ] Reminder proposals still require user approval.
- [ ] No Reef Brain console errors.

### Reef Timeline

- [ ] Reef Timeline opens.
- [ ] Search works.
- [ ] Filters work.
- [ ] Apex telemetry event appears after sample/import.
- [ ] Home → What Changed Recently updates.

### AI Vision

- [ ] AI Vision page opens.
- [ ] Full Tank mode opens upload/camera flow.
- [ ] Save Full-Tank History works.
- [ ] Save to Livestock Timeline works.
- [ ] Photo analysis distinguishes observation from diagnosis.
- [ ] Poor image quality lowers certainty.

### Days-Off Plan

- [ ] Days-Off Plan opens.
- [ ] Generate plan works.
- [ ] Completed tasks remain filtered.
- [ ] Blocked/resolved tasks do not reappear.
- [ ] Cancelled chaeto-reactor tasks do not reappear.

### Reef Library and Tank Memory

- [ ] Tank Memory opens and saves.
- [ ] Tank Knowledge Base opens and saves.
- [ ] Text document upload extracts readable content.
- [ ] PDF upload extracts readable text.
- [ ] Unsupported/scanned documents show an honest limitation.
- [ ] Relevant library documents are retrieved for Ask AI.
- [ ] Backup/export includes library and memory keys.

### Dark Mode

- [ ] Home readable.
- [ ] My Tank readable.
- [ ] Apex Integration readable.
- [ ] Reef Timeline readable.
- [ ] Inputs and buttons have adequate contrast.

### Mobile Layout

- [ ] No overlapping text.
- [ ] No horizontal scrolling.
- [ ] Bottom navigation remains usable.
- [ ] Cards have proper spacing.

## Build 1A Documentation Verification

- [ ] `AI_ENGINE.md` exists in the project root.
- [ ] `ARCHITECTURE.md` points to `AI_ENGINE.md`.
- [ ] `ROADMAP.md` defines Builds 1A–5 and later simulation.
- [ ] `DEVELOPMENT_GUIDELINES.md` includes evidence and AI safety rules.
- [ ] `CHANGELOG.md` records a documentation-only build.
- [ ] No runtime JavaScript, HTML, CSS, API, or Vercel configuration changed.
- [ ] `package.json` version remains unchanged.

## Build 1B Structured Context Tests

### Data normalization

- [ ] Current Apex temperature becomes a normalized observation.
- [ ] Manual chemistry tests preserve units and timestamps.
- [ ] Tank Memory facts retain authoritative/resolved status.
- [ ] Reef Library records retain source metadata.
- [ ] Existing records migrate without deletion.
- [ ] Export/import preserves new schema versions.

### Freshness and authority

- [ ] Fresh Apex data outranks fixed profile values for current telemetry.
- [ ] Stale Apex data is labeled and down-weighted.
- [ ] Current manual chemistry test outranks an older log.
- [ ] Fixed profile is never presented as a current reading.
- [ ] Conflicting live and manual pH values remain separately identified.

### Retrieval

- [ ] Relevant tank history is selected without sending the full database.
- [ ] Relevant approved knowledge is selected by topic.
- [ ] Superseded sources are excluded from normal recommendations.
- [ ] Retrieval includes contradictory evidence where available.
- [ ] Duplicate copies of one claim do not count as independent support.

## Build 1C Decision Engine Tests

### Evidence and reasoning

- [ ] Consequential answers separate observation, inference, and recommendation.
- [ ] Alternative explanations are considered for diagnostic questions.
- [ ] Missing critical data can produce a Hold outcome.
- [ ] A single anecdote cannot produce high confidence.
- [ ] Photo-only disease claims are capped at Moderate.
- [ ] One before/after event cannot prove causation.
- [ ] Strong tank history cannot override a known safety boundary.

### Recommendation safety

- [ ] Stable conditions do not trigger aggressive intervention.
- [ ] Rapid nutrient stripping is not recommended without urgent justification.
- [ ] Chemistry adjustments include monitoring and reassessment timing.
- [ ] The least disruptive useful action is preferred.
- [ ] No AI result directly controls aquarium equipment.

### Decision Journal

- [ ] Significant accepted recommendation can be saved.
- [ ] The situation snapshot and evidence references are stored.
- [ ] Routine educational answers are not automatically journaled.
- [ ] Outcome status can be recorded later.
- [ ] Confounding changes can be attached to an outcome.

## Build 2 Graph and ICP Tests

- [ ] All graph timestamps use one consistent timezone.
- [ ] Missing periods render as gaps.
- [ ] Downsampling preserves spikes, minima, and maxima.
- [ ] Event overlays align with the correct time.
- [ ] Data-completeness percentage is accurate.
- [ ] Calibration and probe-replacement events reset/label comparisons.
- [ ] AI trend language states the analysis window.
- [ ] ICP sample date and report date remain distinct.
- [ ] AI-extracted ICP values require confirmation.
- [ ] Units are normalized without losing the original value.

## Build 3 Aquarium Observer Tests

- [ ] Display and sump cameras authenticate to the connector.
- [ ] Full-resolution captures save to the configured SSD path.
- [ ] Internet loss does not stop local capture.
- [ ] Selected thumbnails upload when connectivity returns.
- [ ] Routine retention does not delete incidents, favorites, or before/after images.
- [ ] Camera relocation resets the comparison baseline.
- [ ] Changed lighting lowers visual-comparison confidence.
- [ ] Blur, obstruction, and darkness are detected as poor-quality inputs.
- [ ] Vision observations do not independently diagnose or control equipment.
- [ ] Deleted routine images leave an honest metadata/reference state.

## Deterministic AI Fixtures

Maintain fixed test cases for:

1. Stable normal tank.
2. Stale Apex telemetry.
3. Conflicting live and manual pH.
4. Rapid phosphate decline after GFO.
5. Elevated-temperature emergency.
6. Missing alkalinity before a kalk question.
7. Apparent algae increase caused by changed camera lighting.
8. Outdated manual for a different equipment model.
9. One unsupported forum anecdote.
10. Multiple independent high-quality sources agreeing.
11. Multiple interventions causing confounding.
12. Resolved or cancelled issue incorrectly resurfacing.

For each fixture, store expected observations, prohibited claims, maximum confidence, and acceptable action range.
