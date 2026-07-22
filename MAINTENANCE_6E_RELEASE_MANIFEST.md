# Reef Keeper Maintenance 6E Release Manifest

## Release

- Version: `4.3.39`
- Baseline: user-verified `4.3.38 / Maintenance 6D`
- Scope: conservative consolidation of duplicate inline storage and HTML-escaping helpers

## Intentional runtime change

Maintenance 6E removes duplicate helper implementations without changing their callers' visible behavior.

The release:

- provides one canonical `rkReadStoredJson(key, fallback)` helper for System Check, Reef Timeline, and Reports;
- provides one canonical `rkReadStoredArray(key)` helper for Equipment and Home array reads;
- provides one canonical `rkEscapeHtml(value)` helper for Reef Timeline and Reports;
- removes the retired `rkSystemCheckReadJson`, Timeline `readJson` and `esc`, `rkReportReadJson`, `rkReportEsc`, `rkEquipmentParseArray`, and `rkHomeParseArray` implementations;
- removes the unused `rkHomeNumber` helper after repository-wide call-site verification;
- preserves missing-key fallback values, malformed-JSON recovery, non-array rejection, and HTML entity output exactly.

## Files intentionally changed

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `tests/release-regression.test.cjs`
- `tests/index-data-snapshot-cleanup.test.mjs`
- `tests/index-storage-helper-cleanup.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-6E.sha256`
- `MAINTENANCE_6E_RELEASE_MANIFEST.md`
- `MAINTENANCE_6E_TEST_REPORT.md`

## Explicitly unchanged

- navigation and page routing
- app-shell CSS, scrolling, and bottom-tab layout
- local-storage keys, schemas, migrations, and backup behavior
- Timeline ordering, filtering, intelligence, milestones, and saved photos
- report content, previews, and downloads
- API functions and Vercel routes
- AI access-key enforcement and request guards
- Apex integration and data minimization
- Aquarium Observer behavior
- Raspberry Pi connector and services
- runtime dependencies

## Rollback

Rollback to the user-verified `4.3.38 / Maintenance 6D` deployment or repository ZIP if any device regression appears.
