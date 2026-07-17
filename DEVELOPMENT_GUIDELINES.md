# Reef Keeper Development Guidelines

**Last updated:** July 17, 2026

## Core Rules

1. Reef Brain / Decision Engine owns intelligence.
2. Reef Timeline / Tank History owns chronology.
3. Storage owns persistence and migrations.
4. Tank State owns authoritative current facts, targets, and resolved issues.
5. Apex Bridge owns normalized telemetry input.
6. Knowledge Pipeline owns source metadata, freshness, and supersession.
7. Evidence Engine owns weighting, conflicts, and applicability.
8. Camera analysis records observations; the Decision Engine forms conclusions.
9. AI access to aquarium equipment remains read-only.
10. `AI_ENGINE.md` governs all AI behavior and data contracts.

## AI Change Rule

Any change that affects AI context, retrieval, confidence, source weighting, recommendations, reminders, vision interpretation, prediction, or learning must:

- identify the affected `AI_ENGINE.md` section;
- preserve observation/inference/recommendation separation;
- include a deterministic test case;
- document data migrations;
- update the changelog;
- pass the standard regression checklist.

Do not solve architecture problems by adding another large prompt block to `app.js`.

## Evidence Rule

- Do not rank sources only by website or popularity.
- Store source class, scope, date, review status, and applicability.
- Do not count copied claims as independent confirmation.
- Do not allow a single anecdote to drive a consequential action.
- Retrieve contradictory evidence for diagnostic and treatment questions.
- Preserve superseded knowledge for history but exclude it from normal current recommendations.

## Tank Data Rule

- Fixed profile data is background, not a live reading.
- Current values must include source, timestamp, unit, and quality.
- Stale or uncalibrated data must be labeled.
- Conflicting values remain separate until reconciled.
- Resolved issues and cancelled plans remain authoritative until the user changes them.

## Confidence Rule

- Confidence must derive from evidence, not model self-assessment alone.
- Use user-facing bands rather than false-precision percentages by default.
- Enforce caps for photo-only diagnosis, single anecdotes, single interventions, missing critical data, and biological simulations.
- Low confidence should lead to a safe information-gathering action, not a guess.

## Conservative Action Rule

Unless an emergency exists:

1. Verify.
2. Observe for a defined interval.
3. Inspect equipment and husbandry.
4. Make a small reversible change.
5. Change one variable at a time.
6. Escalate only when evidence justifies it.

Every consequential recommendation should include monitoring and reassessment conditions.

## Tank Score Rule

There must be only one Tank Score.

All score calculations flow through Reef Brain. UI code may display the score but may not calculate it independently.

## Timeline Rule

Any event that matters later should feed the Timeline:

- Water test
- Apex telemetry event
- Maintenance action
- Completed reminder
- AI Vision observation
- Camera incident
- ICP result
- Equipment service
- Livestock change
- Accepted significant recommendation
- Recommendation outcome

## Telemetry Rule

Telemetry remains read-only unless a future architecture review explicitly approves safe control logic.

Apex Bridge normalizes incoming data into one versioned shape before Tank State or Reef Brain consumes it.

## Vision and Camera Rule

- Store full-resolution routine camera images locally by default.
- Store metadata and selected remote references in the app.
- Track lighting, camera position, quality, and comparability.
- Do not present visual similarity as a confirmed diagnosis.
- Reset visual baselines after material camera changes.
- Automatic deletion requires a tested, configurable retention policy.

## Graph and Trend Rule

- Display gaps as gaps.
- State the analysis window and data completeness.
- Preserve spikes during downsampling.
- Mark calibration, probe replacement, media replacement, dosing, treatment, and major configuration events.
- Do not infer causation from chart alignment alone.

## Storage and Migration Rule

- Never delete legacy user data during the first migration.
- Use explicit schema versions.
- Migrate alongside legacy records until verification passes.
- Include new keys and records in backup/export and restore tests.
- Keep a rollback ZIP for every release.

## Release Rules

Every release should include:

- one clear goal;
- limited file changes;
- rollback package;
- changelog update;
- relevant architecture and roadmap update;
- targeted tests plus standard preview checklist;
- preview deployment before production.

## Avoid

- Duplicate scoring or recommendation logic.
- Duplicate navigation without purpose.
- New screens when an existing screen can be improved.
- Large refactors mixed with unrelated features.
- Silent data migrations.
- Treating a model response as a validated fact.
- Backup files in the active project root.
- Direct equipment control from AI output.

## Preferred Module Ownership

```text
app.js                         boot + navigation + compatibility adapters
ai/context-builder.js         normalized AI context
ai/evidence-engine.js         evidence quality and conflicts
ai/decision-engine.js         conclusions and actions
ai/skeptic-engine.js          alternative explanations
ai/confidence-engine.js       confidence bands and caps
ai/decision-journal.js        recommendations and outcomes
home-dashboard.js             Home UI
reef-brain.js                 Tank Score and briefings
reef-timeline.js              history presentation
state/tank-state.js           authoritative current state
storage/storage.js            durable versioned storage
telemetry/apex-bridge.js       telemetry normalization
telemetry/trend-engine.js      graphs and trend calculations
knowledge/library-store.js     source storage and metadata
vision/observer.js             camera and photo observations
maintenance-engine.js         due tasks and planning
```
