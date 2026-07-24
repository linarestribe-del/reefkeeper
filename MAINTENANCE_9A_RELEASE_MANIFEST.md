# Reef Keeper Maintenance 9A Release Manifest

## Release

- Application version: `4.3.47`
- Observer publisher: `2.5.1` live-compatible; repository publisher source remains `2.5`
- Observer schema: `9`
- Integration Core: `9A.1`
- Shared tank-event schema: `1`
- Release family: `Maintenance 9A — Integration Core`
- Baseline: verified `4.3.46 / Maintenance 8D`

## Purpose

Maintenance 9A gives Reef Keeper a shared, structured event stream so a fact entered once can be reused by Maintenance, Aquarium Observer, Reef Timeline, reports, Home recent changes, backups, and Ask AI.

This release establishes the integration foundation without replacing or deleting the existing browser records that currently power each screen.

## Runtime changes

- Added `integration-core.js` as a browser-side integration layer.
- Added the device-local `reef_tank_events_v1` structured event store with stable deterministic event IDs and duplicate protection.
- Added `reef_tank_events_meta_v1` for event-stream status metadata.
- Added `reef_observer_filter_roll_state_v1` for filter-roll cycles, low-frequency measurements, completed-roll history, and future usage forecasting.
- Existing parameter logs are mirrored into `parameter.test.recorded` events.
- Existing maintenance entries are mirrored into structured maintenance events.
- Existing completed-task history is mirrored into `task.completed` events.
- Legacy records remain unchanged and continue to provide rollback compatibility.
- Reef Timeline and reports prefer the shared event stream for parameters, maintenance, completed tasks, and Observer-originated events, with legacy fallbacks.
- The Observer page includes a Filter Roller Learning card that confirms whether Maintenance has started a roll cycle, whether a baseline is pending, and how many measurements are available.
- Home recent changes and Ask AI now consume the shared event stream.
- Reef Keeper backups now include the event stream and filter-roll learning state.

## Connected filter-roller workflow

Maintenance now includes optional **Connected equipment** and **Connected action** selectors.

When a maintenance entry represents a filter-fleece replacement, Reef Keeper records:

- `maintenance.filter_roller.fleece_replaced`;
- the replacement timestamp;
- the Filter Roller equipment identity;
- a new Observer filter-roll cycle;
- a pending post-replacement visual baseline.

Free-text entries such as “changed the fleece roll” are also classified when the equipment and replacement wording are clear. The structured selector remains the most reliable path.

## Filter-roll learning boundary

Maintenance 9A does not yet perform camera segmentation or automatically estimate the roll diameter.

It provides the Observer-facing contract needed by that future detector:

- one active roll cycle at a time;
- completed-cycle preservation across replacements;
- one to three suggested measurements per day;
- deduplicated measurement records;
- learning stages of `learning`, `preliminary`, and `established`;
- weighted usage-rate and days-remaining calculations once sufficient measurements exist.

## Safety boundaries

- No existing user record is deleted, renamed, or rewritten during migration.
- Synchronization is idempotent; repeated app loads do not duplicate events or create false filter-roll cycles.
- No new Vercel function is added. The deployment remains at 12 functions.
- No Raspberry Pi service, camera credential, RTSP URL, Observer token, Apex path, or R2 credential is changed.
- No automatic maintenance task is created from an Observer estimate in this phase.
- No per-frame OpenAI request is added.

## Deployment

1. Keep the confirmed `4.3.46 / Maintenance 8D` deployment available for rollback.
2. Deploy the `4.3.47` web repository.
3. Open Reef Keeper on the primary iPhone installation.
4. Confirm existing parameter logs, maintenance history, Timeline, Observer, Apex, and Ask AI still load.
5. Log a test maintenance entry using **Filter Roller → Fleece roll replaced**.
6. Confirm the action appears once in Maintenance, Home recent changes, and Reef Timeline.
7. Export a backup and confirm the shared event stream and filter-roll learning fields are present.

## Rollback

Restore the prior `4.3.46 / Maintenance 8D` Vercel deployment.

The new local-storage keys may remain on the device. The older build ignores them. Existing `reef_logs`, `reef_actions`, and `reef_completed_history` records remain intact and require no reverse migration.
