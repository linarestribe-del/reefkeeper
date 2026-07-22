# Reef Keeper Maintenance 6F Release Manifest

## Release

- Version: `4.3.40`
- Baseline: user-verified `4.3.39 / Maintenance 6E`
- Scope: stable post-cleanup checkpoint and automated release hardening

## Intentional runtime change

Maintenance 6F does not alter application workflows. The Settings version label advances to `Reef Keeper v4.3.40 Maintenance 6F` so deployed devices and rollback packages can be identified unambiguously.

## Added safeguards

- repository-wide Node.js syntax checking for `.js`, `.mjs`, and `.cjs` files;
- independent parsing of every inline `index.html` script;
- duplicate top-level browser function detection;
- an explicit compatibility exception for the `app.js` `showPage` implementation and the final `index.html` non-recursive compatibility router;
- literal DOM-reference validation against static IDs, dynamically created IDs, and a documented optional legacy allowlist;
- one stable-baseline test requiring all previous cleanup tests, repository integrity, release files, and Vercel function-count protection to remain active;
- `npm run test:stability` for the hardening subset.

## Files intentionally changed

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `ROLLBACK.md`
- `TEST_PLAN.md`
- `DEVELOPMENT_GUIDELINES.md`
- `tests/release-regression.test.cjs`
- `tests/javascript-syntax.test.mjs`
- `tests/global-function-integrity.test.mjs`
- `tests/dom-reference-integrity.test.mjs`
- `tests/stable-baseline.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-6F.sha256`
- `MAINTENANCE_6F_RELEASE_MANIFEST.md`
- `MAINTENANCE_6F_TEST_REPORT.md`

## Explicitly unchanged

- page routing, scrolling, bottom navigation, handlers, and rendering output;
- local-storage keys, schemas, migrations, backups, and saved user data;
- paid AI endpoints, access-key enforcement, body limits, and rate guards;
- Apex telemetry and data minimization;
- Aquarium Observer browser, API, Blob, and Raspberry Pi behavior;
- Vercel routes and serverless function count;
- runtime dependencies.

## Rollback

Rollback to the user-verified `4.3.39 / Maintenance 6E` deployment or full source ZIP if any device regression appears.
