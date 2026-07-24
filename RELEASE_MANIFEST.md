# Current release — Maintenance 8D

- Application: `4.3.46`
- Observer publisher: `2.5`
- Observer schema: `9`
- Baseline: verified `4.3.45 / Maintenance 8C`
- Detailed manifest: `MAINTENANCE_8D_RELEASE_MANIFEST.md`
- Test report: `MAINTENANCE_8D_TEST_REPORT.md`
- Recovery package: `Reef_Keeper_Maintenance_8D_v4.3.46_DUAL_CAMERA_OBSERVER.zip`

Maintenance 8D adds dual-camera Observer publishing and UI while preserving the existing overview archive and the 12-function Vercel boundary.

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
