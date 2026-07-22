# Reef Keeper Maintenance 6C Release Manifest

## Release

- Version: `4.3.37`
- Baseline: user-verified `4.3.36 / Maintenance 6B`
- Scope: conservative inline-handler and Home-renderer consolidation in `index.html`

## Intentional runtime change

Maintenance 6C removes repeated handler declarations and repeated DOM-update logic without removing any visible control.

The release:

- replaces 22 repeated `scrollToolToTop(...)` inline attributes with `data-scroll-tool` attributes;
- installs one delegated click listener for the 11 long-term tool overlays;
- preserves both scroll-to-top controls in each tool header;
- introduces one shared `rkHomeRenderSnapshot` function for primary and fallback Reef Brain snapshots;
- retains separate primary Reef Brain and Apex fallback data-acquisition paths;
- performs the Home telemetry refresh once through the shared snapshot renderer.

## Files intentionally changed

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `tests/release-regression.test.cjs`
- `tests/index-handler-render-cleanup.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-6C.sha256`
- `MAINTENANCE_6C_RELEASE_MANIFEST.md`
- `MAINTENANCE_6C_TEST_REPORT.md`

## Explicitly unchanged

- `app.js` and navigation behavior
- app-shell CSS and scrolling layout
- local-storage schemas, migrations, and backups
- API functions and Vercel routes
- AI access-key enforcement and request guards
- Apex integration and data minimization
- Aquarium Observer behavior
- Raspberry Pi connector and services
- runtime dependencies

## Rollback

Rollback to the user-verified `4.3.36 / Maintenance 6B` deployment or repository ZIP if any device regression appears.
