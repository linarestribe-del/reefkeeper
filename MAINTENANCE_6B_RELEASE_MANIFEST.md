# Reef Keeper Maintenance 6B Release Manifest

## Release

- Version: `4.3.36`
- Baseline: user-verified `4.3.35 / Maintenance 6A`
- Scope: conservative inline JavaScript cleanup in `index.html`

## Intentional runtime change

Maintenance 6B removes inline JavaScript that is unreachable or redundantly repeats work already performed by the canonical direct navigator.

The release:

- removes seven named helper functions with no call sites anywhere in the repository;
- removes layered `showPage` and `showWorkspace` wrappers that repeated Home intelligence rendering after direct navigation;
- removes the second forced Home render attached to `window.load`;
- retains one DOM-ready initial Home render;
- leaves the working `showPage` → `rkDirectGo` path unchanged;
- reduces a Home navigation from two intelligence refreshes and three telemetry refreshes to one of each.

## Removed unreachable helpers

- `rkEquipmentDateLabel`
- `deleteEquipmentItem`
- `rkHomeScoreFromLog`
- `rkHomeOpenLatestPhoto`
- `rkHomeTelemetrySnapshot`
- `rkHomeRequestCloudTelemetry`
- `rkHomeTelemetryAge`

## Files intentionally changed

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `tests/release-regression.test.cjs`
- `tests/index-js-cleanup.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-6B.sha256`
- `MAINTENANCE_6B_RELEASE_MANIFEST.md`
- `MAINTENANCE_6B_TEST_REPORT.md`

## Explicitly unchanged

- `app.js` and its direct internal navigator
- app-shell CSS and Maintenance 6A layout behavior
- API functions and Vercel routes
- AI access-key enforcement and request guards
- Apex integration and data minimization
- Aquarium Observer behavior
- Raspberry Pi connector and services
- Local-storage schemas, migrations, and backup content
- Runtime dependencies

## Rollback

Rollback to the user-verified `4.3.35 / Maintenance 6A` deployment or repository ZIP if any device regression appears.
