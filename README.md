# Reef Keeper

**Current application version:** `4.3.31`  
**Current release family:** Build 2L.1 — Aquarium Observer weekly/monthly time-lapses with the Vercel Hobby-plan consolidation  
**Maintenance state:** Maintenance 1 adds repository safeguards only; it does not intentionally change application behavior.

Reef Keeper is a browser-based reef aquarium management application with local tank records, Apex telemetry, AI-assisted analysis, and a Raspberry Pi Aquarium Observer pipeline.

## Current major capabilities

- Tank profile, parameter logging, maintenance records, reminders, and timeline
- Evidence, decision, explainability, trend, and chart modules
- Ask AI with tank context, document input, single-photo analysis, and 2–4 photo comparison
- Apex telemetry display
- Aquarium Observer latest image, historical comparisons, health checks, daily summaries, change alerts, and rolling time-lapses
- Private Observer uploads from the Raspberry Pi to Vercel Blob

## Repository layout

```text
api/                  Vercel serverless functions (currently 12)
ai/                   Browser evidence, decision, explainability, and trend modules
connector/            Raspberry Pi / Apex connector source
css/                   Main stylesheet copy used by index.html
lib/                   Shared Observer server helpers
assets/                Application images
tests/                 Regression and repository-safety tests
.github/workflows/     Automated GitHub checks
```

## Local verification

Use Node.js 22. The repository includes `.nvmrc`, a Node engine declaration, and `package-lock.json`.

```bash
npm ci
npm test
```

The test command includes application regressions, Pi time-lapse selection tests, repository-integrity checks, and a Vercel function-count check.

## Deployment constraint

The Vercel Hobby deployment currently uses all **12** available functions. New backend features must be added to existing endpoints or must first consolidate/remove another function. The automated function-count check fails before deployment if this limit is exceeded.

## Aquarium Observer

The Raspberry Pi keeps the complete five-minute archive on the external drive. Only selected current/history images, daily comparison material, alert data, and finished compressed time-lapses are published to private Vercel Blob storage.

Current Pi-side components include:

- camera capture timer;
- Observer publisher timer;
- health reporting;
- daily summary frame selection;
- weekly/monthly time-lapse builder.

Observer write authentication depends on `REEF_OBSERVER_WRITE_TOKEN`. Do not commit tokens, camera credentials, RTSP URLs, `.env` files, or local network details.

## Apex integration note

The repository presently contains both `/api/apex-sync` + `/api/apex-status` and `/api/telemetry` paths. The live installation is working, but these paths should not be consolidated during a general cleanup. Apex consolidation must be a separate, rollback-ready build after the installed Pi connector is captured and compared with repository source.

## Safe release process

1. Start from a confirmed working repository ZIP.
2. Make one narrowly scoped change.
3. Run `npm ci` and `npm test`.
4. Confirm the Vercel function count remains at or below 12.
5. Preview or deploy the candidate without altering the Pi unless required.
6. Run the smoke-test checklist in [`ROLLBACK.md`](ROLLBACK.md).
7. Keep the prior Vercel deployment and repository ZIP available until testing is complete.

## Rollback

See [`ROLLBACK.md`](ROLLBACK.md) for the exact restoration procedure and smoke-test checklist.
