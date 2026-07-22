# Reef Keeper Test Plan

**Last updated:** July 22, 2026

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
- [ ] Reef background extends through the iPhone status area without a solid blue band.
- [ ] Reef Keeper title/tagline scrolls with the page and does not clip Home content.
- [ ] Bottom navigation remains fixed and usable.
- [ ] Completed Ask AI responses open at the beginning of the answer.
- [ ] Cards have proper spacing.


## Maintenance 7A automated UI checks

The standard `npm test` suite must verify:

- [x] `viewport-fit=cover` and translucent iPhone standalone status-bar metadata remain present;
- [x] `.app-header` remains inside `.app-content` and before the active page content;
- [x] `.bottom-nav` remains outside the scroll container;
- [x] safe-area scroll padding and chat-message scroll margins remain active;
- [x] completed Ask AI success and error responses use `scrollChatMessageToTop`;
- [x] the positioning helper aligns the new message with `block: start` after the render frame.

Device verification remains required because the iPhone safe-area and installed-web-app status bar cannot be fully reproduced by the repository VM tests.

## Maintenance 6F automated stabilization checks

Run from the repository root:

```bash
npm ci
npm test
```

The standard suite must now verify:

- [x] every `.js`, `.mjs`, and `.cjs` file parses under Node.js 22;
- [x] every inline `index.html` script parses independently;
- [x] no new duplicate top-level browser function declaration is introduced;
- [x] the documented `showPage` compatibility router remains the only allowed duplicate;
- [x] literal `getElementById` and simple `#id` selector references resolve to static, dynamically created, or documented optional elements;
- [x] retired navigation, Home wrapper, inline handler, data-snapshot, and helper implementations remain absent;
- [x] required release, checksum, CI, rollback, and repository files remain present;
- [x] the Vercel deployment remains at or below 12 serverless functions.

Use `npm run test:stability` to run only the checkpoint safeguards.

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

- [x] Current Apex temperature becomes a normalized observation.
- [x] Manual chemistry tests preserve units and timestamps.
- [x] Tank Knowledge facts retain user-rule authority and locked status weighting.
- [x] Reef Library records retain source metadata.
- [x] Existing Reef Library records migrate without deletion.
- [ ] Export/import preserves new schema versions.

### Freshness and authority

- [x] Fresh Apex data becomes authoritative for current telemetry.
- [x] Stale Apex data is labeled and down-weighted.
- [x] Current manual chemistry test outranks an older log.
- [x] Fixed profile is excluded from the structured current-state record.
- [x] Conflicting live and manual pH values remain separately identified.

### Retrieval

- [x] Relevant tank evidence is capped and selected without serializing the full database.
- [x] Relevant eligible knowledge is selected by topic and weight.
- [x] Superseded sources are excluded from normal retrieval.
- [ ] Retrieval includes contradictory evidence where available.
- [x] Evidence records carry independence-group identifiers for later corroboration logic.

### Automated Build 1B commands

Run from the project root:

```bash
npm test
```

This executes deterministic evidence normalization/current-state tests and the Parameter Log/direct-navigation regression test. The navigation test also verifies that `/ai/` is statically routed before the SPA fallback.

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

## Build 1C Decision Engine tests

- Verify strong, current, independent evidence produces higher confidence than missing, stale, or conflicting evidence.
- Verify required data changes by question topic.
- Verify stale or missing critical measurements lower the permitted action ceiling.
- Verify the Skeptic Layer preserves counter-evidence and limitations.
- Verify the Parameter Log navigation regression check remains green.


## Build 2B Graph Display Regression

- Verify graph x positions are proportional to elapsed time rather than reading index.
- Verify working-range bands are included in the chart domain and rendered for every supported parameter.
- Verify relevant logged events receive markers only within the displayed trend period.
- Verify tapping or dragging across the graph selects the nearest reading.
- Verify keyboard Left/Right/Home/End inspection works when the graph is focused.
- Verify value/date labels remain readable on narrow iPhone layouts and in Night Reef mode.
- Verify no Ask AI, navigation, Apex, or localStorage schema changes are introduced.

## Build 2C — In-Answer Explainability

- Confirm tank-context responses include an Evidence Review inside the AI message bubble.
- Confirm general-chat responses do not show tank-specific explainability.
- Confirm confidence is taken from the deterministic Decision Engine and is never invented by the language model.
- Confirm strongest evidence is ordered by effective evidence weight.
- Confirm missing/stale evidence, Skeptic Layer notes, and action ceiling are rendered safely.
- Confirm new saved conversations retain explainability metadata and older conversations remain readable.
- Confirm only `role` and `content` are sent to `/api/chat`.
- Confirm no Why button, renamed core asset, navigation change, or saved-data migration is introduced.

## Maintenance 7B automated status-canvas checks

- Require the reef-compatible `theme-color` meta tag.
- Require the reef asset on the root `html/body` canvas.
- Require `.ocean-bg` to remain transparent so the image is not restarted below the iPhone status area.
- Require root and `css/` stylesheet copies to remain identical.
- Retain all Maintenance 7A header and Ask AI positioning assertions.

## Maintenance 8A Cloudflare R2 migration checks

- Confirm `lib/observer-r2.js` is the active Observer remote-storage implementation and `lib/observer-blob.js` is only a compatibility re-export.
- Confirm the `@vercel/blob` package and all Vercel Blob runtime imports are absent.
- Confirm R2 requests require the four `REEF_OBSERVER_R2_*` environment variables.
- Confirm PUT and GET requests use AWS Signature Version 4, fixed private object paths, payload hashes, and redirect rejection.
- Confirm status JSON reads and image stream metadata normalize to the existing Observer API contract.
- Confirm the existing Pi publisher and all 12 Vercel functions remain unchanged in route count and authentication behavior.
- Live activation must occur with the Pi publisher timer disabled, followed by one manual publish before the timer is re-enabled.
