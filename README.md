# Reef Keeper

**Current application version:** `4.3.56`  
**Current release family:** Maintenance 9F.1 — Observer Camera Scoping and Filter-Roll Actions  
**Maintenance state:** Maintenance 9F.1 keeps Observer Publisher 2.8.0 active and tightens the app UI: camera-scoped alerts, compact active alert details, direct fleece-roll replacement logging, and cleaner filter-roll history.

Reef Keeper is a browser-based reef aquarium management application with local tank records, Apex telemetry, AI-assisted analysis, and a Raspberry Pi Aquarium Observer pipeline.

Maintenance 9F.1 is documented in `MAINTENANCE_9F_1_RELEASE_MANIFEST.md` and `MAINTENANCE_9F_1_TEST_REPORT.md`. It is an app-only update over 9F; no Raspberry Pi reinstall is required.

## Current major capabilities

- Tank profile, parameter logging, maintenance records, reminders, and a shared cross-feature tank-event stream
- Evidence, decision, explainability, trend, and chart modules
- Ask AI with tank context, document input, single-photo analysis, and 2–4 photo comparison
- Apex telemetry display
- Aquarium Observer dual-camera current views, independent health checks, overview history, daily summaries, change alerts, rolling time-lapses, and filter-roll status/history
- Private Observer uploads from the Raspberry Pi through Vercel APIs to Cloudflare R2

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

The test command includes application regressions, JavaScript and inline-script syntax validation, duplicate global-function detection, literal DOM-reference validation, Pi time-lapse selection tests, repository-integrity checks, and a Vercel function-count check. Use `npm run test:stability` for the hardening subset.

## Deployment constraint

The Vercel Hobby deployment currently uses all **12** available functions. New backend features must be added to existing endpoints or must first consolidate/remove another function. The automated function-count check fails before deployment if this limit is exceeded.

## Aquarium Observer

The Raspberry Pi keeps the complete five-minute archive on the external drive. Only selected current/history images, daily comparison material, alert data, and finished compressed time-lapses are published to private Cloudflare R2 storage.

Current Pi-side components include:

- camera capture timer;
- Observer publisher timer;
- health reporting;
- daily summary frame selection;
- weekly/monthly time-lapse builder.

Observer write authentication depends on `REEF_OBSERVER_WRITE_TOKEN`. Do not commit tokens, camera credentials, RTSP URLs, `.env` files, or local network details.

## Paid AI endpoint safeguards

Maintenance 5B applies to `/api/chat`, `/api/plan`, `/api/livestock`, and `/api/photo-analysis`. It adds:

- endpoint-specific JSON body-size ceilings before OpenAI is called;
- a 24-message / 96,000-character server-side chat-history ceiling;
- explicit JPEG, PNG, WebP, or GIF data-URL validation for photo analysis;
- per-client burst limits with `429` responses and `Retry-After`;
- `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` on guarded AI responses.

The rate limiter is intentionally dependency-free and persists only within a warm Vercel function instance. It reduces accidental retries and simple bursts, but it is not durable distributed rate limiting. Optional `REEF_AI_*` variables can tune the defaults documented in `MAINTENANCE_5B_RELEASE_MANIFEST.md`.

Maintenance 5C adds durable shared-key caller authentication. After `REEF_AI_ACCESS_KEY` is configured in Vercel, the app must send the matching device-local key to all four paid AI endpoints. Configure the key under Settings → AI on every device. The key is not included in Reef Keeper backup exports. See `MAINTENANCE_5C_RELEASE_MANIFEST.md` for staged activation, rotation, verification, and rollback instructions.

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

## Cloudflare R2 Observer configuration

Maintenance 8A keeps the R2 bucket private. Configure these Vercel Production environment variables before re-enabling the Pi publisher:

- `REEF_OBSERVER_R2_ENDPOINT`
- `REEF_OBSERVER_R2_ACCESS_KEY_ID`
- `REEF_OBSERVER_R2_SECRET_ACCESS_KEY`
- `REEF_OBSERVER_R2_BUCKET` (`reefkeeper-observer`)

The R2 credentials belong only in Vercel. The Raspberry Pi continues using its existing Observer publish endpoint and write token.


## Maintenance 8B daily monitoring

Publisher 2.3 reports a Daily monitoring health component and limits failed daily-summary retries to three attempts per representative frame, spaced three hours apart by default. Camera, publisher, SSD, Pi power, archive, and daily-summary health issues can appear as operational alerts without sending camera frames to OpenAI.


## Maintenance 8C local sump monitoring

Publisher 2.4 evaluates a reduced grayscale copy of the latest frame on the Raspberry Pi. It learns lighting-specific stable-view baselines, confirms obstruction or framing changes across repeated captures, and can track a visible sump water line after explicit calibration. Compact metrics and issue codes are published with Observer health; the full local frame archive remains on the SSD and no per-frame OpenAI call is made. Water-level monitoring uses the separate non-secret `/etc/reefkeeper-observer/monitoring.json` file and starts disabled.

## Maintenance 8D dual-camera Observer

Publisher 2.5 keeps the existing sump-overview pipeline and adds a separate return-chamber current image, health record, local monitor, and calibration target. The web app uses the existing Observer APIs with a validated camera selector, so Vercel remains at 12 functions. Overview history, daily summaries, and timelapses remain overview-only. The return camera is the default target for `observer-water-level-calibrate.py --camera return`.


## Maintenance 9A Integration Core

`integration-core.js` mirrors existing parameter logs, maintenance actions, and completed tasks into a device-local structured event stream without changing the original records. Stable event IDs make repeated synchronization safe. Timeline, reports, Home recent changes, backups, and Ask AI can consume the same events.

A connected filter-roller replacement entry starts a new Observer roll cycle. The cycle store is ready for one to three overview-camera measurements per day and future multi-roll usage learning, but this release does not yet include the image-segmentation detector.


## Maintenance 9D Filter-Roll Status and History

The Observer page now displays the active roll percentage, partial/full-cycle label, latest accepted camera measurement, unique current-cycle history, usage trend, confidence reasons, warnings, and a provisional replacement date range. The calculation stays in deterministic browser code and reads the existing Maintenance 9A cycle state. Publisher 2.7.3 and the 12-function Vercel deployment remain unchanged.


## Maintenance 9F Observer Visual Reliability

Publisher 2.8.0 compares fixed cabinet/plumbing anchor zones separately from the serviceable skimmer, GFO, hose, lid, and cord areas. Expected maintenance variation can settle and become part of the learned baseline without creating a persistent whole-scene alert, while actual camera movement, obstruction, or fixed-anchor changes still raise Attention. Filter-roll tracking now uses recent-frame consensus, a 65% default confidence threshold, schedule-aware validation, plausible-change guardrails, and preserved accepted/rejected attempt history. Both calibration helpers save private JSON files as `root:reefkeeper` with mode `0640`.
