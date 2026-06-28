# Reef Keeper Development Guidelines

## Core Rules

1. Reef Brain owns intelligence.
2. Reef Timeline owns history.
3. Storage owns persistence.
4. Tank State owns authoritative facts and resolved issues.
5. Apex Bridge owns normalized telemetry input.

## Tank Score Rule

There must be only one Tank Score.

All score calculations should flow through Reef Brain. UI code may display the score, but should not calculate it independently.

## Timeline Rule

Any event that matters later should feed the Timeline:

- Water test
- Maintenance action
- Completed reminder
- AI Vision save
- Equipment service
- Apex telemetry import
- Livestock change

## Telemetry Rule

Telemetry should be read-only unless a future release explicitly implements safe control logic.

Apex Bridge should normalize incoming data into one shape before Reef Brain consumes it.

## Release Rules

Every release should include:

- One clear goal.
- Limited file changes.
- CHANGELOG update.
- Test checklist.
- Preview deployment before merge.

## Avoid

- Duplicate scoring logic.
- Duplicate navigation that opens the same destination without purpose.
- New screens when an existing screen can be improved.
- Large refactors mixed with new features.
- Backup files in the active project root.

## Preferred Future Module Ownership

```text
app.js                boot + navigation only
home-dashboard.js     Home UI
reef-brain.js         intelligence + score
reef-timeline.js      history
apex-bridge.js        telemetry import/store
apex-connect.js       Apex settings UI
maintenance-engine.js due tasks
vision.js             AI Vision UI/save flow
storage.js            durable storage
state.js              authoritative tank memory
```
