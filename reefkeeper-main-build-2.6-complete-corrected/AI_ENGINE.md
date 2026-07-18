# Reef Keeper AI Engine

**Status:** Approved architecture for Build 1A  
**Target release family:** Reef Keeper v5.x  
**Last updated:** July 17, 2026  
**Owner:** Reef Brain / Decision Engine

## 1. Purpose

This document defines how Reef Keeper should gather evidence, reason about the aquarium, express uncertainty, learn from outcomes, and integrate future telemetry, graphs, ICP reports, and camera observations.

It is the design authority for AI behavior. New AI features must follow this document rather than adding isolated prompts or independent scoring logic.

Reef Keeper is a private, conservative reef decision-support system. It is not intended to replace direct observation, calibrated testing, equipment safeguards, veterinary expertise, or emergency judgment.

## 2. Product Definition

Reef Keeper should behave like an experienced reef mentor who has reviewed this specific aquarium's current state, long-term history, trusted references, and prior outcomes before making a recommendation.

The system should optimize for:

1. Protecting livestock and system stability.
2. Correctly describing what is known versus inferred.
3. Using the user's tank data before generic advice when the data is reliable and applicable.
4. Giving stronger evidence more influence than popular but weak claims.
5. Preferring reversible, measured interventions over abrupt changes.
6. Remembering decisions and outcomes without pretending that correlation proves causation.
7. Admitting when evidence is insufficient.

## 3. Current-State Audit

The current application already contains several foundations that should be preserved during implementation:

- `app.js` builds a fixed tank profile through `TANK_CONTEXT`.
- `getLocalTankMemorySummary()` compiles parameter logs, actions, completed tasks, active reminders, persistent tank knowledge, relevant older history, and Reef Library excerpts.
- `buildLiveApexContextForAI()` adds current Apex telemetry when available.
- `/api/chat.js` selects Quick, Balanced, Deep, or Simple model profiles and requests structured reminder suggestions.
- `vision.js` and `/api/photo-analysis.js` ask the model to separate observation from diagnosis and report uncertainty.
- The Reef Library extracts text from supported documents and performs basic keyword ranking.
- Tank Memory and the Tank Knowledge Base persist authoritative facts and user decisions in browser storage.

These are useful capabilities, but the current flow remains primarily prompt-driven:

```text
User question
  -> concatenate fixed profile + local summaries + Apex text + library excerpts
  -> send to one model call
  -> display answer
```

The v5 architecture replaces that loose concatenation with explicit data contracts, evidence classification, freshness controls, a skeptic pass, confidence rules, and decision journaling.

## 4. Non-Goals

Build 1A does not:

- change the visible interface;
- automatically scrape the public internet;
- allow AI control of Apex outlets, heaters, pumps, dosing, ATO, or other equipment;
- claim medical or veterinary diagnosis from a photograph;
- retrain the underlying language model;
- create exact biological simulations;
- discard older records solely because they are old;
- replace existing backups or local data without migration testing.

## 5. AI Constitution

Every Reef Keeper recommendation must follow these principles.

### 5.1 Tank first, when the tank evidence is valid

Current calibrated readings, reliable trend data, known equipment state, verified maintenance history, and repeated outcomes from this aquarium should strongly influence recommendations.

Tank-specific evidence must not automatically override established chemistry or safety constraints. A repeated harmful pattern is still harmful even if the aquarium has temporarily tolerated it.

### 5.2 Science over popularity

Established chemistry, peer-reviewed research, and reproducible biological principles outweigh community popularity.

### 5.3 Qualified expertise over influence

Long-established subject-matter experts are weighted by relevant expertise, quality of reasoning, transparency, and consistency with stronger evidence—not follower count.

### 5.4 Manufacturer sources are authoritative within scope

Manufacturer documentation is strong evidence for operation, limits, calibration, maintenance, compatibility, and firmware behavior. Marketing or husbandry claims receive less weight unless independently supported.

### 5.5 Community reports are observations, not proof

Forum and social reports are useful for discovering equipment quirks, uncommon failure modes, visual examples, and repeated practical observations. They must not establish chemistry, causality, dosing safety, or diagnosis by themselves.

### 5.6 Stability before optimization

When no emergency exists, prefer the smallest reversible action and allow enough observation time before stacking additional changes.

### 5.7 Separate observation, inference, and recommendation

The system must distinguish:

- **Observation:** directly measured, logged, or visibly detected.
- **Inference:** the best explanation supported by available evidence.
- **Recommendation:** the proposed action, including risk and monitoring.

### 5.8 Explain uncertainty

When multiple explanations fit, Reef Keeper must rank them, state what is missing, and avoid false precision.

### 5.9 Learn from outcomes cautiously

A successful outcome can increase confidence in a tank-specific pattern. It does not prove the intervention caused the outcome, especially when multiple variables changed.

### 5.10 Protect the aquarium

Do not recommend fast nutrient stripping, large chemistry corrections, abrupt lighting changes, unsafe dosing, or automated equipment control without explicit guardrails and sufficient evidence.

## 6. System Architecture

```text
                        REEF KEEPER UI
                              |
                              v
                       Question Router
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
      Tank Context Builder              Knowledge Retriever
             |                                 |
             +----------------+----------------+
                              |
                              v
                         Evidence Set
                              |
                              v
                       Decision Engine
                              |
                    +---------+---------+
                    |                   |
                    v                   v
              Skeptic Layer       Safety Guardrails
                    |                   |
                    +---------+---------+
                              |
                              v
                    Recommendation Package
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
        User Answer      Decision Journal   Reminder Proposals
```

The UI may request and display results. It must not independently calculate confidence, diagnose conditions, or duplicate recommendation logic.

## 7. Module Ownership

The target module boundaries are:

```text
app.js                         boot, routing, temporary compatibility adapters
ai/ai-constitution.js         immutable reasoning and safety principles
ai/context-builder.js         normalized tank context assembly
ai/question-router.js         intent and evidence-needs classification
ai/knowledge-retriever.js     trusted-library retrieval and ranking
ai/evidence-engine.js         evidence records, weighting, conflicts, freshness
ai/decision-engine.js         candidate conclusions and action selection
ai/skeptic-engine.js          alternative explanations and overconfidence checks
ai/confidence-engine.js       confidence band and rationale
ai/recommendation-engine.js   final response package
ai/decision-journal.js        recommendation and outcome records
ai/risk-engine.js             future risk detection
ai/simulation-engine.js       bounded what-if estimates
state/tank-state.js            current authoritative digital-twin state
state/tank-history.js          normalized historical observations and events
storage/storage.js             persistence and migrations
telemetry/apex-bridge.js       normalized Apex snapshots
telemetry/trend-engine.js      time-series calculations and data quality
knowledge/library-store.js     documents and metadata
knowledge/knowledge-graph.js   topics, claims, relationships, supersession
vision/observer.js             normalized display/sump camera observations
vision/image-store.js          image metadata and retention rules
icp/icp-import.js              ICP extraction, confirmation, and storage
```

Modules may initially be introduced gradually. Compatibility wrappers should preserve existing behavior during migration.

## 8. Core Data Contracts

### 8.1 Tank observation

A tank observation is a direct record, not a conclusion.

```json
{
  "id": "obs_...",
  "observedAt": "2026-07-17T15:00:00Z",
  "recordedAt": "2026-07-17T15:00:04Z",
  "type": "parameter|telemetry|maintenance|vision|livestock|equipment|note|icp",
  "source": "apex|manual_test|camera_display|camera_sump|user|icp_lab",
  "metric": "temperature",
  "value": 78.1,
  "unit": "F",
  "quality": {
    "status": "verified|estimated|uncertain|invalid",
    "calibrationKnown": true,
    "ageSeconds": 4,
    "notes": ""
  },
  "links": ["equipment_heater_1"],
  "rawRef": null
}
```

### 8.2 Knowledge source

```json
{
  "id": "source_...",
  "title": "Document or source title",
  "sourceClass": "peer_reviewed|expert|manufacturer|community_expert|community|anecdote|user_rule",
  "publisher": "",
  "authors": [],
  "publishedAt": null,
  "reviewedAt": null,
  "validFrom": null,
  "validUntil": null,
  "status": "current|review_due|superseded|historical|retracted|unknown",
  "scope": ["chemistry", "phosphate"],
  "equipmentModels": [],
  "firmwareVersions": [],
  "trust": {
    "baseWeight": 0.8,
    "reason": "Established expert chemistry reference"
  },
  "supersededBy": [],
  "contentRef": "local-library-id"
}
```

### 8.3 Evidence record

```json
{
  "id": "ev_...",
  "claim": "Phosphate is falling faster after the GFO replacement.",
  "kind": "tank_observation|scientific_fact|expert_guidance|manufacturer_instruction|community_pattern|anecdote|derived_trend",
  "direction": "supports|contradicts|neutral",
  "sourceId": "source_or_observation_id",
  "relevance": 0.92,
  "reliability": 0.88,
  "freshness": 0.95,
  "applicability": 0.90,
  "independenceGroup": "gfo_change_2026_07",
  "limitations": ["Only four post-change readings"],
  "effectiveWeight": 0.69
}
```

### 8.4 Recommendation package

```json
{
  "answer": "User-facing explanation",
  "observations": [],
  "leadingExplanation": "",
  "alternatives": [],
  "recommendations": [],
  "avoid": [],
  "monitor": [],
  "confidence": {
    "band": "very_high|high|moderate|low|insufficient",
    "score": 0.78,
    "reasons": [],
    "limitations": [],
    "wouldChangeMind": []
  },
  "evidenceSummary": {
    "tank": 4,
    "science": 1,
    "expert": 2,
    "manufacturer": 0,
    "community": 0,
    "conflicts": 1
  },
  "risk": {
    "urgency": "emergency|urgent|soon|routine|observe",
    "interventionRisk": "high|moderate|low",
    "failureCost": "high|moderate|low"
  },
  "reminderCandidates": [],
  "journalCandidate": null
}
```

## 9. Evidence Hierarchy

The hierarchy is a starting prior, not a rigid website ranking.

| Evidence class | Default influence | Appropriate use |
|---|---:|---|
| Verified current tank data | Very high | Current state, trend, equipment status |
| Repeated tank-specific outcomes | High | Personalized response patterns, with confounder checks |
| Established chemistry / peer-reviewed science | Very high | Mechanism, safety boundaries, biological constraints |
| Established relevant expert | High | Interpretation and practical reef application |
| Manufacturer technical documentation | High within scope | Equipment operation, limits, calibration, firmware |
| Independent practical consensus | Moderate | Husbandry methods where stronger evidence is limited |
| Identified expert forum contribution | Moderate, topic-dependent | Troubleshooting and practical observations |
| General forum consensus | Low to moderate | Pattern discovery and hypothesis generation |
| Individual anecdote | Low | Possible clue only |
| Unattributed social content | Very low | Normally excluded from decisions |

### 9.1 Tank evidence limitations

Tank history is down-weighted when:

- measurements are uncalibrated or inconsistent;
- timestamps are missing;
- multiple interventions occurred together;
- the apparent pattern has happened only once;
- the livestock or equipment configuration has materially changed;
- the observation conflicts with a known safety boundary;
- survival is being mistaken for health.

### 9.2 Community evidence rules

Reef2Reef and similar sources may contribute when:

- the author is identifiable and has relevant demonstrated expertise;
- the post includes measurements, photos, dates, methods, or follow-up;
- multiple independent reports describe the same pattern;
- the claim is not contradicted by stronger chemistry or safety evidence;
- the information is still applicable to the equipment model, firmware, or husbandry method.

Replies that merely repeat another claim must not be counted as independent corroboration.

## 10. Freshness, Review, and Supersession

Older knowledge is not automatically wrong. Freshness is topic-specific.

### 10.1 Suggested review intervals

| Knowledge type | Default review interval |
|---|---:|
| Fundamental seawater chemistry | 5 years |
| Coral and microbial biology | 3 years |
| Treatment and disease guidance | 1 year |
| ICP interpretation | 1 year |
| Manufacturer manual | On model/firmware change or 2 years |
| Equipment comparison/review | 1 year |
| Firmware bug or cloud-service behavior | 90 days |
| Community troubleshooting thread | 1 year, sooner for software/equipment |
| User-created tank rule | Review after contradictory outcome or major system change |

These intervals trigger review; they do not force deletion.

### 10.2 Source status

- **Current:** approved for normal retrieval.
- **Review due:** retrievable but freshness lowers weight.
- **Superseded:** normally excluded from recommendations unless historical context is useful.
- **Historical:** retained for chronology, not current practice.
- **Retracted:** excluded and flagged.
- **Unknown:** low weight until reviewed.

### 10.3 Versioned claims

The graph should preserve claim history:

```text
Claim A v1 (historical)
  -> superseded by Claim A v2
  -> refined by Claim A v3
```

A new source must not silently overwrite the old source or erase why a prior decision was made.

## 11. Knowledge Graph

The Knowledge Graph connects claims, topics, equipment, observations, actions, and outcomes.

Example:

```text
High room CO2
  -> can lower -> aquarium pH
  -> may be reduced by -> outdoor skimmer air
  -> observed by -> Apex pH trend
  -> tested by -> open-window comparison
  -> affects -> kalk decision
```

### 11.1 Node types

- Topic
- Claim
- Source
- Parameter
- Equipment
- Livestock
- Event
- Intervention
- Outcome
- Risk
- User rule

### 11.2 Relationship types

- supports
- contradicts
- causes
- contributes_to
- associated_with
- measured_by
- affects
- mitigated_by
- contraindicates
- applies_to
- supersedes
- observed_in
- followed_by

The initial implementation may use metadata and indexed records rather than a dedicated graph database. The contract matters more than the storage technology.

## 12. Question Router

Before retrieval, classify the request.

### 12.1 Intent examples

- Current-state interpretation
- Trend explanation
- Diagnosis / differential
- Dosing calculation
- Equipment operation
- Maintenance planning
- Livestock compatibility
- Emergency response
- What-if simulation
- General education
- Document / ICP analysis
- Visual analysis

### 12.2 Evidence needs

The router should declare what evidence is required.

Example:

```json
{
  "intent": "trend_explanation",
  "topics": ["alkalinity"],
  "required": ["recent_alk_logs", "dosing_changes", "water_changes"],
  "optional": ["calcium", "pH", "coral_growth", "ICP"],
  "freshness": {
    "telemetrySeconds": 300,
    "manualTestsDays": 14
  },
  "riskClass": "moderate"
}
```

## 13. Context Builder

The context builder converts existing localStorage records, Apex data, inventory, equipment, reminders, timeline entries, and future camera/ICP records into normalized objects.

It should not send every record to the model. It should produce:

1. Current authoritative state.
2. Recent relevant window.
3. Long-term trend summary.
4. Similar historical events.
5. Known data-quality limitations.
6. Explicit conflicts.

### 13.1 Authority order for current values

1. Fresh calibrated live telemetry for telemetry metrics.
2. Latest confirmed manual test for chemistry metrics.
3. Confirmed ICP result for trace elements, with sample and report dates.
4. Older manual log.
5. Fixed profile defaults.

A fixed profile must never be presented as a current reading.

### 13.2 Conflict example

```text
Live Apex pH: 8.19 at 10:42 AM
Last manual pH: 8.35 on July 12
Interpretation: readings use different times/methods; neither silently replaces the other.
```

## 14. Retrieval Pipeline

The retriever should use hybrid ranking:

1. Exact metadata filters: topic, source class, equipment model, date, status.
2. Keyword matching for names and measurements.
3. Semantic similarity for concepts and paraphrases.
4. Evidence-quality reranking.
5. Diversity control to avoid five copies of the same claim.
6. Contradiction retrieval to support the skeptic layer.

### 14.1 Retrieval limits

For a normal answer, target:

- 3–8 tank evidence records;
- 2–5 trusted knowledge records;
- up to 3 contradictory or alternative records;
- only the document passages needed for the question.

Deep mode may retrieve more. Quick mode may use fewer, but safety checks remain mandatory.

### 14.2 No silent internet mixing

The curated library and local records are the normal knowledge source. Future live web retrieval, if added, must be visibly classified as unreviewed external evidence and cannot outrank approved sources until validated.

## 15. Decision Engine

The Decision Engine operates in stages.

### Stage 1: Establish facts

Create a fact table containing direct observations, timestamps, units, and quality.

### Stage 2: Generate candidate explanations

Produce plausible explanations without selecting one too early.

### Stage 3: Match evidence

For each candidate, list supporting, contradictory, and missing evidence.

### Stage 4: Check applicability

Determine whether the evidence applies to this tank's size, livestock, maturity, equipment, recent events, and current trajectory.

### Stage 5: Select the least disruptive useful action

Choose an action that either:

- safely resolves a high-confidence issue; or
- gathers the most informative missing evidence with low risk.

### Stage 6: Define monitoring and stop conditions

Every consequential recommendation should state what to monitor, when to reassess, and what would justify stopping or escalating.

## 16. Skeptic Layer

The skeptic pass challenges the draft decision before the user sees it.

It must ask:

1. What is the strongest alternative explanation?
2. Is a measurement error plausible?
3. Did the system confuse correlation with causation?
4. Did several changes happen at once?
5. Is the recommended action more aggressive than necessary?
6. Is a community claim being treated as established fact?
7. Is an old equipment or firmware source still applicable?
8. Is the answer relying on absent data?
9. Could the proposed action worsen another parameter or livestock condition?
10. What evidence would reverse the conclusion?

### 16.1 Required skeptic outcomes

- **Pass:** recommendation remains materially unchanged.
- **Revise:** confidence, explanation, or action is softened.
- **Hold:** insufficient evidence; request a test, photo, inspection, or observation.
- **Escalate:** immediate safety issue requires urgent action or human expertise.

## 17. Confidence Engine

Confidence is not simply the model's self-reported feeling. It is derived from evidence quality and completeness.

### 17.1 Components

```text
support strength
+ source reliability
+ tank applicability
+ freshness
+ independent corroboration
+ historical repeatability
- contradictory evidence
- missing critical data
- measurement uncertainty
- confounding changes
- extrapolation distance
```

### 17.2 Internal score and user-facing bands

The app may store a 0–1 score for comparison and testing. The interface should normally show bands, not false precision.

| Band | Typical meaning |
|---|---|
| Very high | Direct, reliable evidence; alternatives unlikely |
| High | Strong evidence with minor limitations |
| Moderate | Leading explanation, but meaningful alternatives remain |
| Low | Weak or incomplete evidence; recommendation should focus on gathering data |
| Insufficient | No responsible conclusion yet |

### 17.3 Confidence caps

- Photo-only disease identification: maximum **Moderate**.
- Single anecdote without corroboration: maximum **Low**.
- Uncalibrated sensor contradiction: maximum **Moderate** until confirmed.
- Causal claim after one intervention: maximum **Moderate**.
- Simulation involving biological response: maximum **Moderate** and labeled estimate.
- Missing current alkalinity during a kalk decision: **Insufficient** for dosing recommendation.

## 18. Conservative Action Ladder

Unless an emergency is detected, prefer actions in this order:

1. Verify data quality or repeat the measurement.
2. Observe for a defined interval.
3. Inspect equipment or husbandry conditions.
4. Make a small reversible adjustment.
5. Change one variable at a time.
6. Use a larger intervention only with stronger evidence.
7. Use treatment or emergency actions when risk clearly justifies them.

The system should explicitly avoid stacking several interventions when that would prevent outcome attribution.

## 19. Digital Twin

The Digital Twin is the normalized state of this aquarium.

### 19.1 Four views

- **Current:** best available state now.
- **Historical:** events, measurements, and configuration over time.
- **Target:** personalized ranges, schedules, and desired conditions.
- **Projected:** bounded forecasts from current trends.

### 19.2 State categories

- Water chemistry
- Temperature and pH cycle
- ORP and controller state
- Nutrient management
- Dosing and consumption
- Equipment configuration and service age
- Livestock inventory and condition
- Maintenance and reminders
- Visual condition
- Risks and unresolved issues

### 19.3 Configuration periods

Trend comparisons must account for major system changes. Examples:

- lighting replacement;
- new GFO or carbon method;
- livestock additions;
- salt change;
- dosing restart;
- camera move;
- sensor replacement or calibration.

A trend from a previous configuration period may remain useful but must be labeled.

## 20. Graphs and Trend Engine — Build 2

Graphs are evidence views, not decorative charts.

### 20.1 Data sources

- Apex temperature, pH, ORP, outlet state, alarms, and future supported probes.
- Manual phosphate, alkalinity, nitrate, calcium, magnesium, pH, and salinity tests.
- ICP major, minor, and trace elements.
- Maintenance and media-change events.
- Dosing changes.
- Vision observations.

### 20.2 Required chart behavior

- selectable windows: 24 hours, 7 days, 30 days, 90 days, 1 year, all;
- raw points available for inspection;
- downsampling that preserves spikes and extrema;
- gaps displayed as gaps, not interpolated facts;
- calibration and sensor-replacement markers;
- event overlays for water changes, media changes, dosing changes, treatments, and equipment service;
- target bands clearly distinct from alarm thresholds;
- timezone-consistent timestamps.

### 20.3 Trend calculations

The engine may calculate:

- slope and rate of change;
- rolling median and variability;
- day/night pH amplitude;
- temperature peak, low, and duration above threshold;
- before/after intervention comparisons;
- alkalinity consumption estimates;
- repeated seasonal or schedule patterns;
- anomaly detection relative to this tank's baseline.

Trend language must include the window and data density. For example:

> Temperature rose 0.6°F across the last seven complete days; 96% of expected readings were present.

### 20.4 ICP handling

ICP values must store:

- sample date;
- report date;
- laboratory;
- units;
- lab reference range;
- user's target range when different;
- extraction confidence;
- user confirmation status;
- original report reference.

AI-extracted ICP values are not authoritative until the user confirms them or a reliable structured import is used.

## 21. Aquarium Observer — Build 3

The camera system is another sensor source. It does not independently diagnose or control equipment.

### 21.1 Camera roles

**Display camera:**

- full-tank condition;
- water clarity;
- algae/cyano coverage change;
- coral extension, recession, bleaching, shading, and growth indicators;
- fish presence and broad behavior changes;
- lighting and flow-context changes.

**Sump camera:**

- skimmer foam height and overflow indicators;
- roller status;
- water-level change;
- visible leaks or salt creep;
- reactor flow indicators;
- ATO reservoir/equipment state when visible;
- unexpected darkness, obstruction, or camera movement.

### 21.2 Capture policy

Default proposal:

- routine capture every 60 minutes;
- optional 30-minute interval during an active incident;
- user-requested high-resolution capture on demand;
- event capture when Apex alarms or major telemetry anomalies occur;
- avoid continuous video analysis unless a later need justifies it.

### 21.3 Storage architecture

Authoritative full-resolution images remain on a USB SSD attached to the Raspberry Pi.

```text
reefkeeper-data/
  cameras/
    display/YYYY/MM/DD/
    sump/YYYY/MM/DD/
```

Cloud object storage receives only selected artifacts:

- thumbnails needed by the mobile timeline;
- alert images;
- incident images;
- daily comparison images;
- manually saved/favorited images.

The app database stores metadata and references, not image bytes.

### 21.4 Retention policy

Default proposal:

- keep all routine full-resolution captures locally for 30 days;
- after 30 days, retain one representative image per camera per day;
- retain alert, incident, before/after, and favorite images until manually deleted;
- keep low-resolution timeline thumbnails for 90 days unless tied to a retained event;
- retain extracted observations indefinitely, with a reference indicating whether the image still exists.

Retention must be configurable before automatic deletion is enabled.

### 21.5 Image comparability

Visual trends are valid only when image conditions are sufficiently comparable. Track:

- camera position and crop;
- resolution;
- lighting schedule and spectrum period;
- exposure/white balance when available;
- obstruction and blur;
- maintenance activity in frame;
- camera relocation or replacement.

A baseline must reset after a material camera change.

### 21.6 Vision observation contract

```json
{
  "camera": "display",
  "capturedAt": "2026-07-17T15:00:00Z",
  "imageQuality": "good|usable|poor",
  "observations": [
    {
      "label": "water_clarity",
      "state": "normal",
      "confidence": "high",
      "region": null
    }
  ],
  "changesFromBaseline": [],
  "possibleConcerns": [],
  "requiresHumanReview": false,
  "imageRef": "local-or-cloud-reference"
}
```

The visual model should record what it can see. The Decision Engine combines that with chemistry, telemetry, maintenance, and history.

## 22. Decision Journal — Build 1 / Build 5 Foundation

Store significant recommendations so outcomes can be evaluated later.

### 22.1 Journal record

```json
{
  "id": "decision_...",
  "createdAt": "2026-07-17T15:00:00Z",
  "question": "Why is phosphate rising?",
  "situationSnapshot": {},
  "leadingExplanation": "GFO exhaustion is the leading explanation.",
  "alternatives": [],
  "recommendations": [],
  "confidenceAtDecision": "high",
  "evidenceIds": [],
  "userAccepted": null,
  "outcomeDueAt": null,
  "outcome": null,
  "lessons": []
}
```

### 22.2 What should be journaled

Journal when the answer includes:

- a chemistry or dosing adjustment;
- treatment;
- equipment change;
- media replacement tied to a diagnosis;
- livestock intervention;
- a significant risk warning;
- a what-if choice the user decides to implement.

Do not journal routine educational questions unless the user saves them.

## 23. Learning Engine — Build 5

The system does not retrain the language model. It updates tank-specific evidence records.

### 23.1 Outcome states

- Improved
- Unchanged
- Worsened
- Mixed
- Unknown
- Not implemented

### 23.2 Learning rules

- Require a defined observation window.
- Record other changes that occurred in the same period.
- Increase weight modestly after one apparent success.
- Require repeated similar outcomes before creating a strong tank rule.
- Reduce confidence when a recommendation repeatedly fails.
- Never learn an unsafe rule that conflicts with established safety constraints.
- Allow the user to correct or reject a learned conclusion.

### 23.3 Example

```text
Observation: phosphate decline accelerated after fresh GFO.
Limitations: feeding also decreased during the same week.
Result: useful tank-specific evidence, not proof of sole causation.
```

## 24. Risk Engine — Build 4

The Risk Engine should identify developing risks rather than create noisy alerts.

### 24.1 Inputs

- threshold violations;
- rate of change;
- duration outside the personal baseline;
- interacting weak signals;
- equipment service age;
- unresolved tasks;
- visual changes;
- prior incident patterns.

### 24.2 Risk score dimensions

- likelihood;
- expected severity;
- time to harm;
- confidence;
- reversibility;
- detectability.

### 24.3 Alert discipline

- Suppress duplicate alerts for the same ongoing condition.
- Escalate only when evidence or severity increases.
- Clear alerts when resolution evidence is present.
- Explain why the alert fired.
- Distinguish warning thresholds from personalized target ranges.

## 25. Simulation Engine — Later Build

Simulation answers are bounded estimates, not promises.

### 25.1 Suitable simulations

- dosing arithmetic;
- dilution from a water change;
- estimated media life based on prior use;
- simple trend projection;
- lighting ramp schedule comparison;
- feeding-load scenarios with broad uncertainty.

### 25.2 Unsuitable claims

The system must not claim exact coral growth, disease outcome, fish survival, nutrient production, or ecosystem response.

### 25.3 Simulation output

Every simulation must include:

- assumptions;
- input values and timestamps;
- estimated range rather than a single false-precision result;
- uncertainty band;
- risks and interactions;
- a safer test or staged implementation.

## 26. User-Facing Answer Structure

The answer should remain natural rather than showing internal JSON. For consequential questions, use this order:

1. Direct conclusion.
2. What Reef Keeper observed.
3. Most likely explanation and alternatives.
4. Safest next action.
5. What to monitor and when to reassess.
6. Confidence and what would change it.

Example:

```text
GFO exhaustion is the leading explanation, but the evidence is not conclusive.

Why: phosphate rose across four tests while feeding stayed similar, and the media is older than its recent effective service life. A testing difference remains possible.

Next: repeat phosphate with the same clean vial and method. If confirmed, replace a conservative amount of GFO rather than aggressively stripping phosphate. Recheck in 48–72 hours.

Confidence: Moderate. A confirmed repeat test and media-change date would raise it.
```

## 27. Safety and Control Boundaries

### 27.1 Read-only controller policy

AI may interpret Apex data but may not directly control:

- heaters;
- return pumps;
- powerheads;
- dosing pumps;
- ATO;
- lights;
- UV;
- solenoids;
- outlets.

Any future control feature requires a separate architecture review, explicit user confirmation, hard-coded safety limits, audit logs, and local fail-safe behavior.

### 27.2 Treatment and emergency guidance

- Distinguish emergency stabilization from diagnosis.
- Request current measurements when dosing depends on them.
- Calculate total system volume conservatively.
- State assumptions.
- Avoid combining treatments without compatibility evidence.
- Recommend specialist help when animal health or electrical/fire risk exceeds the app's competence.

## 28. Privacy and Security

- Tank data remains private to the user's deployment and configured services.
- API keys remain server-side.
- Full camera archives remain local by default.
- Cloud images use private object storage and expiring access links where supported.
- Image metadata must not expose home-network addresses.
- The Pi connector should authenticate uploads and reject replayed or malformed requests.
- Backups must include new structured records and schema versions.
- Logs must avoid storing API keys, cookies, or private camera credentials.

## 29. Data Migration and Compatibility

The v5 engine must migrate incrementally from current localStorage keys.

### 29.1 Migration rules

- Never delete legacy data during first migration.
- Write a schema version.
- Create normalized records alongside existing data.
- Verify record counts and samples.
- Allow rollback to the prior build.
- Include migrated data in export/import backups.
- Preserve user-resolved issues and cancelled plans as authoritative rules.

### 29.2 Current data sources to map

- `reef_logs`
- `reef_actions`
- `reef_completed_history`
- `reef_ai_reminders`
- inventory and equipment keys
- `reef_tank_knowledge_base`
- `reef_library_docs`
- Tank Memory keys
- timeline and visual-history keys
- Apex telemetry snapshots and events
- chat/decision history where applicable

## 30. Testing Strategy

### 30.1 Deterministic fixtures

Create fixed tank scenarios with expected evidence and safe outputs:

- normal stable tank;
- stale Apex data;
- conflicting live and manual pH;
- rapid phosphate decline;
- elevated temperature emergency;
- apparent camera algae increase under changed lighting;
- old manufacturer manual for a different model;
- one unsupported forum anecdote;
- multiple independent expert sources in agreement;
- missing alkalinity before a kalk question.

### 30.2 Required assertions

- fixed profile is never presented as a live reading;
- stale telemetry is labeled;
- evidence sources are not counted twice;
- superseded sources do not drive current recommendations;
- the skeptic pass retrieves at least one alternative for diagnostic questions;
- confidence caps are enforced;
- aggressive actions require stronger evidence;
- missing critical data produces a hold/request-for-data outcome;
- accepted recommendations can be journaled;
- no recommendation automatically controls equipment.

### 30.3 Evaluation dimensions

- factual grounding;
- evidence quality;
- tank applicability;
- calibration/freshness handling;
- uncertainty honesty;
- action safety;
- usefulness;
- consistency across model modes;
- regression against current features.

## 31. Observability

Development diagnostics should record:

- request ID;
- intent classification;
- evidence counts by class;
- records excluded for staleness or status;
- confidence band and cap reason;
- skeptic outcome;
- model/profile used;
- response latency;
- journal decision status.

Do not expose raw private prompts or sensitive credentials in production logs.

## 32. Staged Implementation Plan

### Build 1A — Architecture foundation

- Add this document.
- Update architecture, roadmap, guidelines, test plan, and changelog.
- No runtime behavior change.

### Build 1B — Structured context and evidence contracts

- Introduce normalized context builder.
- Wrap current memory and Apex functions without removing them.
- Add source classes and freshness metadata to Reef Library records.
- Add deterministic tests for context selection.

### Build 1C — Decision, skeptic, confidence, and journal foundation

- Return a structured recommendation package from the server.
- Add skeptic checks and confidence caps.
- Add opt-in decision journal records.
- Preserve existing answer and reminder behavior.

### Build 2 — Graphs, telemetry history, trends, and ICP

- Persist Apex history safely.
- Add graph views and event overlays.
- Add trend calculations and data-quality reporting.
- Add confirmed ICP import and comparison.

### Build 3 — Aquarium Observer

- Add display and sump camera ingestion on the Raspberry Pi.
- Add local SSD archive and retention service.
- Add selected cloud thumbnails/incident images.
- Add normalized visual observations and timeline comparisons.

### Build 4 — Risk and prediction

- Add risk patterns, alert deduplication, and bounded forecasts.
- Compare warnings against the tank's historical baseline.

### Build 5 — Learning and outcome review

- Add outcome prompts, confounder capture, and repeated-pattern learning.
- Add decision-quality review and monthly report integration.

### Later — Simulation and controlled expansion

- Add bounded what-if tools.
- Reassess whether any additional automation is safe and worthwhile.

## 33. Definition of Done for the AI Foundation

The foundation is complete when:

- one documented Decision Engine owns AI recommendations;
- tank data and knowledge sources are normalized into evidence records;
- every consequential answer distinguishes observation, inference, and recommendation;
- confidence is derived from evidence and obeys caps;
- a skeptic pass can revise or hold a conclusion;
- accepted consequential recommendations can be journaled;
- older and superseded knowledge is handled explicitly;
- graphs, ICP, and cameras can plug into the same evidence contract;
- all current app features pass regression testing;
- no AI path can directly control aquarium equipment.

## 34. Governing Rule

When implementation convenience conflicts with trustworthy reasoning, trustworthy reasoning wins. When a feature does not improve observation, evidence quality, decision safety, or learning, it should not be added to the AI engine.
