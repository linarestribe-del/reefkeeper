# Reef Keeper Maintenance 6A Release Manifest

## Release

- Version: `4.3.35`
- Baseline: verified `4.3.34 / Maintenance 5C`
- Scope: `index.html` app-shell navigation and scrolling CSS cleanup

## Intentional runtime change

Maintenance 6A replaces four layered inline layout patches with one canonical style block. The canonical block preserves the effective production behavior already verified in Maintenance 5C:

- `.app-content` remains the sole vertical scroll container.
- The global bottom navigation remains fixed, visible, and tappable.
- Safe-area and bottom-navigation clearance remain in place.
- Home retains its existing bottom clearance.
- Non-Home pages continue to grow naturally rather than becoming clipped nested scroll panels.

The cleanup removes unused selectors for `.tab-bar`, `.bottom-tabs`, `.nav-tabs`, and `#bottom-nav`, none of which exist in the current application.

## Files intentionally changed

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `tests/release-regression.test.cjs`
- `tests/index-layout-cleanup.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-6A.sha256`
- `MAINTENANCE_6A_RELEASE_MANIFEST.md`
- `MAINTENANCE_6A_TEST_REPORT.md`

## Explicitly unchanged

- `app.js` and application navigation logic
- API functions and Vercel routes
- AI access-key enforcement and request guards
- Apex integration and data minimization
- Aquarium Observer behavior
- Raspberry Pi connector and services
- Local storage schemas and backup content
- Runtime dependencies

## Rollback

Rollback to the verified `4.3.34 / Maintenance 5C` deployment or repository ZIP if any layout regression appears during device testing.
