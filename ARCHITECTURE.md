# Reef Keeper Architecture

**Last updated:** July 22, 2026  
**Current runtime family:** v4.3.41 / Build 2L.1  
**Maintenance state:** Maintenance 7A mobile UI fixes on the Maintenance 6F stable checkpoint  
**Target architecture:** v5.x evidence-based AI engine


## Current deployed system boundary

```text
Browser / iPhone app
  -> local browser records and UI
  -> 12 Vercel serverless functions
  -> OpenAI APIs, private Vercel Blob, and Apex/telemetry storage

Raspberry Pi
  -> Tapo camera capture every five minutes
  -> local SSD archive
  -> authenticated Observer publishing
  -> daily comparison selection
  -> weekly/monthly time-lapse generation
```

The Vercel Hobby deployment is currently at the 12-function limit. New backend behavior must extend an existing function or be preceded by a separately tested consolidation.

The repository contains two Apex endpoint families: `/api/apex-sync` + `/api/apex-status`, and `/api/telemetry`. The live installation is working, but consolidation is intentionally deferred until the installed Pi connector is captured and compared against repository source.

## Maintenance 1 safeguards

Maintenance 1 does not refactor runtime code. It adds:

- locked dependency installation through `package-lock.json`;
- Node.js 22.x and npm 10.x version declarations;
- GitHub Actions checks;
- repository-integrity and function-count tests;
- an explicit rollback procedure and release manifest.

The fragile navigation, inline-script, duplicate-file, Apex, and security work remain separate future builds.

## Maintenance 6F stable checkpoint

Maintenance 6F changes no application workflow, storage schema, API route, Pi service, or Observer behavior. It establishes `4.3.40` as the post-cleanup baseline before two isolated UI fixes and the next Observer phase.

The checkpoint adds automated enforcement for:

- syntax validity of repository JavaScript and every inline `index.html` script;
- duplicate top-level browser function declarations, with only the documented `showPage` compatibility router allowed;
- literal DOM references, including static, dynamically created, and explicitly optional legacy elements;
- continued exclusion of the retired layered navigation and Home-render patches;
- repository integrity, synchronized duplicate runtime files, secret exclusions, and the 12-function Vercel limit.

Future UI and Observer work must branch from this checkpoint and remain separately deployable and reversible.

## Maintenance 7A mobile UI boundary

Maintenance 7A changes only the browser shell and final Ask AI response positioning:

- `.app-header` is the first child of `.app-content`, so the title and tagline scroll with the active page;
- the fixed bottom navigation remains outside `.app-content`;
- iPhone standalone mode uses full safe-area coverage rather than reserving a solid status-bar band;
- successful and failed Ask AI responses retain the newly rendered message node and align that node at the start of the scroll viewport after rendering.

No evidence, decision, prompt, API, storage, Apex, Observer, or Pi boundary changes in this release.

## Core Philosophy

Reef Brain is the single owner of aquarium intelligence. The user interface displays decisions but does not independently calculate diagnoses, confidence, trends, or recommendations.

The complete AI design is defined in [`AI_ENGINE.md`](AI_ENGINE.md).

## Current Runtime

```text
Browser / iPhone app
  -> `ai/evidence-engine.js` normalizes local records and live Apex data into
     timestamped observations, evidence weights, current state, conflicts,
     source metadata, and data-quality limitations
  -> `app.js` retains the legacy context during migration and appends the
     structured evidence contract before calling `/api/chat.js`
  -> `/api/chat.js` selects the model profile and requests an answer/reminders
  -> response is rendered in Ask AI
```

Additional flows:

- `apex-bridge.js` and connector services normalize live telemetry.
- `vision.js` and `/api/photo-analysis.js` support user-submitted photo analysis.
- `maintenance-engine.js` supports maintenance and Days-Off planning.
- Reef Timeline owns historical event presentation.
- Browser storage currently owns most persistent app data.

## Build 1B Runtime Modules

### `ai/evidence-engine.js`

- Dependency-free browser normalization layer.
- Does not mutate user tank records.
- Assigns stable observation/evidence IDs.
- Selects authoritative current values by source authority, freshness, and timestamp.
- Preserves live and manual measurements separately when they conflict.
- Excludes superseded, retracted, and historical Reef Library sources from normal retrieval.
- Exposes a structured prompt contract while Build 1C is still pending.

### Compatibility boundary

The legacy text context remains active in Build 1B so existing Ask AI behavior and reminders continue to work. The structured evidence block is authoritative when it conflicts with legacy prose. Build 1C will move observations, inferences, confidence, and recommendations into a server response contract.

## Target Architecture

```text
Sensors and records
  Apex | Manual tests | ICP | Maintenance | Livestock | Equipment | Cameras
                                  |
                                  v
                         Normalized Tank State
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
          Tank History Store               Knowledge Pipeline
                 |                                 |
                 +----------------+----------------+
                                  |
                                  v
                           Evidence Engine
                                  |
                                  v
                           Decision Engine
                                  |
                     +------------+------------+
                     |                         |
                     v                         v
               Skeptic Layer             Safety Guardrails
                     |                         |
                     +------------+------------+
                                  |
                                  v
                       Recommendation Package
                                  |
          Ask AI | Reef Brain | Timeline | Risk alerts | Decision Journal
```

## Component Ownership

### Reef Brain / Decision Engine

- Evidence-based recommendations
- Tank score and health interpretation
- Confidence and uncertainty
- Skeptic review
- Risk prioritization
- Daily and monthly briefing logic

### Tank State / Digital Twin

- Current authoritative values
- Personalized targets
- Equipment and livestock configuration
- Data freshness and quality
- Current unresolved issues

### Reef Timeline / Tank History

- Measurements and telemetry history
- Maintenance and equipment events
- Livestock changes
- Vision observations
- ICP results
- Decisions and outcomes

### Knowledge Pipeline

- Curated documents and claim metadata
- Evidence source classification
- Review dates and freshness
- Superseded and historical knowledge
- Topic and relationship indexing

### Apex Integration

- Read-only normalized telemetry input
- Telemetry history
- Alarm and outlet-state interpretation
- No direct equipment control

### Trend Engine

- Graph-ready time series
- Data completeness and gaps
- Rate of change and variability
- Event overlays and before/after comparisons

### Aquarium Observer

- Display and sump camera snapshots
- Local full-resolution archive
- Selected cloud thumbnails and incident images
- Visual observations supplied to the Decision Engine

### ICP

- Report extraction and user confirmation
- Element history and laboratory metadata
- Trend and target comparison

### Storage

- Versioned persistence
- Migration from current localStorage data
- Backup and restore
- Image metadata and references

## Architectural Rules

1. Reef Brain owns intelligence.
2. Tank State owns authoritative current facts.
3. Reef Timeline/Tank History owns chronology.
4. Storage owns persistence and schema migrations.
5. Apex Bridge owns normalized telemetry input.
6. The Knowledge Pipeline owns source metadata, freshness, and supersession.
7. The Evidence Engine owns weighting and conflict handling.
8. The UI may display calculations but may not reimplement them.
9. Camera analysis records observations; the Decision Engine forms conclusions.
10. AI access to aquarium equipment remains read-only.

## Release Workflow

1. Define one clear build goal.
2. Update architecture contracts before implementation when behavior changes.
3. Work from the latest verified ZIP/repository state.
4. Preserve a rollback package.
5. Implement limited, modular file changes.
6. Run targeted and full regression tests.
7. Preview deploy before production.
8. Update `CHANGELOG.md`, `ROADMAP.md`, `TEST_PLAN.md`, and this document.


### Build 2B graph presentation

`ai/trend-chart.js` converts deterministic trend results into a time-scaled chart model. It owns chart coordinates, readable axis ticks, target-band geometry, event-marker positions, and nearest-point inspection. `app.js` remains responsible for rendering that model into the existing Parameter Trends card. No graph code changes saved-record schemas or AI context.


## Build 2C presentation layer

`ai/explainability.js` converts Evidence and Decision Engine output into a compact record displayed directly inside new tank-context Ask AI responses. It does not make decisions or ask the language model to justify itself.
