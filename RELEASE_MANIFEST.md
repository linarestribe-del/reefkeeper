# Current release — Maintenance 9A

- Application: `4.3.47`
- Integration Core: `9A.1`
- Shared tank-event schema: `1`
- Observer publisher: `2.5` repository source; compatible with the live `2.5.1` hotfix
- Observer schema: `9`
- Baseline: verified `4.3.46 / Maintenance 8D`
- Detailed manifest: `MAINTENANCE_9A_RELEASE_MANIFEST.md`
- Test report: `MAINTENANCE_9A_TEST_REPORT.md`
- Recovery package: `Reef_Keeper_Maintenance_9A_v4.3.47_INTEGRATION_CORE.zip`

Maintenance 9A adds the shared browser event layer and connected filter-roll maintenance workflow without changing the Raspberry Pi publisher or adding a Vercel function.

---


# Maintenance 1 release manifest

## Purpose

Maintenance 1 establishes repository safeguards around the confirmed working Reef Keeper `4.3.31 / Build 2L.1` application.

## Intentional changes

- Added `.gitignore`.
- Added `.nvmrc` and pinned Node.js 22.x in `package.json`.
- Added `package-lock.json` and pinned npm 10.x metadata.
- Added GitHub Actions CI.
- Added repository-integrity and Vercel-function-count tests.
- Updated `README.md` and `ARCHITECTURE.md` release information.
- Added `ROLLBACK.md`, this manifest, `MAINTENANCE_1_TEST_REPORT.md`, and `checksums/runtime-critical.sha256`.
- Removed packaging-only `__MACOSX` metadata from the distributed ZIP.

## Runtime behavior

Maintenance 1 intentionally does **not** modify:

- `index.html`
- `app.js`
- `observer.js`
- `app.css` or `css/app.css`
- `vercel.json`
- files under `api/`, `ai/`, `lib/`, or `connector/`
- Raspberry Pi services or configuration
- Vercel environment variables or Blob configuration

## Runtime checksum record

`checksums/runtime-critical.sha256` records the source hashes of runtime-critical files in this maintenance package. It is intended for comparison and recovery verification; it contains no secrets.

## Deployment checks

- Full `npm test` suite passes.
- JavaScript syntax checks pass.
- Python syntax checks pass.
- Vercel function count is 12/12.
- No duplicate HTML IDs are present.
- No missing local assets referenced by `index.html` are present.
- No nested `package.json` project copy is present.

## Rollback source

Use the separately saved pre-maintenance repository backup or the last confirmed-good Vercel deployment. See `ROLLBACK.md`.
