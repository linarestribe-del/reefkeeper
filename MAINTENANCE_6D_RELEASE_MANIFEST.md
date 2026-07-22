# Reef Keeper Maintenance 6D Release Manifest

## Release

- Version: `4.3.38`
- Baseline: user-verified `4.3.37 / Maintenance 6C`
- Scope: conservative data-snapshot reuse in Reef Timeline and report generation

## Intentional runtime change

Maintenance 6D removes repeated local data reconstruction without changing any visible feature or saved-data format.

The release:

- builds the complete Reef Timeline event array once during each `renderTimeline()` call;
- passes that same full snapshot to filtering, Timeline Intelligence, milestones, and list rendering;
- preserves the existing chronological sort, active search/filter behavior, full unfiltered intelligence totals, and milestone selection;
- allows the Timeline event builder to accept optional preloaded logs, actions, and completed-task arrays while preserving its existing no-argument behavior;
- passes the report base-data snapshot into Timeline generation so Monthly Report, Emergency Binder, and Custom Report do not reread those three storage sources;
- allows the report latest-log formatter to accept and reuse `d.logs`;
- retains the existing default getters for independent callers that do not provide a snapshot.

## Files intentionally changed

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `tests/release-regression.test.cjs`
- `tests/index-data-snapshot-cleanup.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-6D.sha256`
- `MAINTENANCE_6D_RELEASE_MANIFEST.md`
- `MAINTENANCE_6D_TEST_REPORT.md`

## Explicitly unchanged

- navigation and page routing
- app-shell CSS, scrolling, and bottom-tab layout
- local-storage keys, schemas, migrations, and backups
- API functions and Vercel routes
- AI access-key enforcement and request guards
- Apex integration and data minimization
- Aquarium Observer behavior
- Raspberry Pi connector and services
- runtime dependencies

## Rollback

Rollback to the user-verified `4.3.37 / Maintenance 6C` deployment or repository ZIP if any device regression appears.
