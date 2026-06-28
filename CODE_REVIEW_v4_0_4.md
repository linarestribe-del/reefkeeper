# Reef Keeper Code Review – v4.0.4

Date: June 2026  
Scope: current v4.0.4 codebase after Live Telemetry merge.

## Executive Summary

Reef Keeper is now a substantial single-page application with a real intelligence architecture. The core systems are present and working: Reef Brain, Reef Timeline, Apex telemetry bridge, AI Vision, Equipment Intelligence, Maintenance Engine, Storage v8, and Tank State.

The app is ready to continue toward v4.0.5 Live Reef Brain, but there are several architectural cleanup items that should be handled in parallel so the codebase does not become fragile as live telemetry and Copilot features grow.

## Current Architecture

```text
index.html
  ├─ Static app shell and screen markup
  ├─ Home inline helper functions
  ├─ Equipment Manager helper functions
  └─ Script loader

app.js
  ├─ Primary legacy app controller
  ├─ Chat, logs, reminders, My Tank, reports, inventory
  ├─ Older tank score/dashboard logic
  └─ Many global functions still used by modules

storage.js
  └─ Durable DB wrapper + legacy localStorage sync

state.js
  └─ Authoritative tank memory and blocked-task rules

reef-brain.js
  ├─ Current intelligence layer
  ├─ Tank score / daily brief / recommendations
  ├─ Reads storage, logs, equipment, Apex bridge, timeline-related data
  └─ Exposes window.ReefKeeperBrain

reef-timeline.js
  ├─ Unified history/event engine
  ├─ Builds events from logs, maintenance, completed tasks, visual history, Apex telemetry
  └─ Exposes window.ReefKeeperTimeline

apex-connect.js
  └─ Apex Integration settings UI

apex-bridge.js
  ├─ Reads/imports normalized Apex-style telemetry
  ├─ Stores latest snapshot and history
  ├─ Refreshes Reef Brain / Home / Timeline
  └─ Exposes window.ReefKeeperApexBridge

maintenance-engine.js
  └─ Converts maintenance logs into due tasks and planner context

vision.js
  └─ AI Vision result saving and timeline hooks
```

## Data Flow

### Telemetry Flow

```text
Telemetry Test / future bridge payload
        ↓
apex-bridge.js
        ↓
localStorage:
  - reef_apex_bridge_snapshot_v1
  - reef_apex_bridge_history_v1
        ↓
ReefKeeperBrain.getSnapshot()
        ↓
Home Daily Brief / Home Live Telemetry / Ask AI context
        ↓
reef-timeline.js builds Apex telemetry events
```

### Timeline Flow

```text
Logs / Maintenance / Completed Tasks / AI Vision / Apex Telemetry
        ↓
reef-timeline.js
        ↓
Reef Timeline page
        ↓
Home → What Changed Recently
```

### Intelligence Flow

```text
Storage + Tank State + Maintenance + Equipment + Vision + Timeline + Apex
        ↓
reef-brain.js
        ↓
Home Dashboard / Daily Assistant / Ask AI / Days-Off Plan
```

## What Is Working Well

1. **Reef Brain exists as a real shared intelligence layer.**
   It now consumes logs, maintenance, equipment, and Apex-style telemetry.

2. **Reef Timeline is the correct memory model.**
   It gives the app a single chronological history rather than disconnected histories.

3. **Apex Bridge is now provider-shaped.**
   It accepts normalized JSON, which means Home Assistant, Raspberry Pi, Mac mini, or another local bridge can eventually output the same format.

4. **Storage v8 protects legacy data.**
   The storage layer lets the app evolve without forcing the user to start over.

5. **The Preview → test → merge workflow is now stable.**
   This has materially reduced production risk.

## Main Risks

### 1. app.js is still too large

`app.js` is roughly 6,500 lines and still owns many unrelated areas: chat, reminders, reports, inventory, parameters, My Tank, days-off plan, and older scoring functions.

**Risk:** Future changes can accidentally affect unrelated screens.

**Recommendation:** Start extracting stable areas into focused modules, but only after v4.0.5.

Suggested future split:

```text
app.js                  → shell / boot / navigation only
chat-ui.js              → chat rendering and history
params.js               → parameter logging and trends
inventory-ui.js         → livestock catalog UI
reports.js              → report generation
reminders-ui.js         → reminders and completed history
```

### 2. Duplicate score logic remains

There are still older score-related functions in `app.js`, including `computeDashboardScore`, `tankDashboardScore`, and dashboard rendering. Reef Brain also exposes score functions.

**Risk:** Another duplicate score could reappear.

**Rule going forward:** Reef Brain is the only owner of Tank Score.

### 3. Inline Home logic remains in index.html

`index.html` includes live telemetry and home intelligence helper functions. That works, but as v4.0.5 expands, this logic should move out.

**Recommendation:** Create `home-dashboard.js` after v4.0.5.

### 4. There are backup/old files in the project root

Examples:
- `app.before_visual_reminder.js`
- `vision.before_visual_reminder.js`

**Risk:** These can be accidentally uploaded, edited, or loaded in the future.

**Recommendation:** Move old backups to `/archive/` or remove them from active GitHub once main is stable.

### 5. Many modules patch global functions

Several modules wrap existing globals:
- `reef-brain.js`
- `reef-timeline.js`
- `maintenance-engine.js`
- `days-off-plan.js`
- `reef-ai-context.js`

This is understandable for incremental refactoring, but long-term it should become explicit initialization.

**Preferred future pattern:**

```js
ReefKeeper.init({
  storage,
  brain,
  timeline,
  apex,
  maintenance
});
```

## Recommended v4.0.5 Scope

Build Live Reef Brain without a large refactor.

### v4.0.5 should add:

1. Telemetry interpretation in Reef Brain.
2. Live telemetry insights on Home.
3. Explainable Tank Score details.
4. Apex trend notes in the Daily Reef Brief.
5. Better timeline text for telemetry events.

### v4.0.5 should not add:

- New major screens.
- Apex write/control actions.
- Complex external bridge service.
- Big module refactor.

## Recommended v4.0.5 Implementation Plan

### Step 1 – Reef Brain live interpretation

Add a function in `reef-brain.js` similar to:

```js
analyzeTelemetry(snapshot)
```

It should return:

```js
{
  status: 'stable|watch|attention',
  lines: [...],
  scoreImpact: [...],
  confidenceImpact: ...
}
```

### Step 2 – Home Live Telemetry upgrade

Home should show not only values, but interpretations:

```text
Temperature 78.2°F
Stable

pH 8.31
Excellent

ORP 412
Normal
```

### Step 3 – Tank Score explanation

Add a compact explanation:

```text
Why this score?
✓ Temperature stable
✓ No Apex alarms
⚠ Phosphate elevated
⚠ Magnesium not logged
```

### Step 4 – Timeline upgrade

Telemetry timeline entries should include a useful summary:

```text
Apex telemetry imported
Temp stable · pH excellent · ORP normal · 3 outlets reported
```

## Technical Debt Backlog

Priority order:

1. Move Home inline functions from `index.html` to `home-dashboard.js`.
2. Make Reef Brain the only Tank Score owner.
3. Archive/remove old backup files.
4. Create a module initialization layer.
5. Move equipment UI functions out of `index.html`.
6. Move report generation out of `app.js`.
7. Create a proper test checklist for each release.

## Go / No-Go for v4.0.5

**Go.**

The current app is stable enough to build v4.0.5 Live Reef Brain, provided we keep the scope focused and do not attempt a large refactor in the same release.

