# Reef Keeper Maintenance 7A Release Manifest

## Release

- Version: `4.3.41`
- Baseline: stable `4.3.40 / Maintenance 6F`
- Scope: two isolated iPhone UI corrections before the next Aquarium Observer phase

## Intentional runtime changes

### Scrollable title and safe-area presentation

- Moves `.app-header` inside `.app-content` as the first scrollable item.
- Keeps `.bottom-nav` outside the scroll container and fixed at the bottom.
- Adds `viewport-fit=cover` and `black-translucent` standalone status-bar handling.
- Uses `env(safe-area-inset-top)` for initial header spacing and positioned content.

### Ask AI completed-answer position

- Retains the new assistant message element returned by `appendMsg`.
- After the response and reminder suggestions render, aligns the beginning of that assistant message with the visible scroll viewport.
- Applies the same behavior to rendered Ask AI errors.
- Continues scrolling the user question and typing indicator toward the bottom while the request is in progress.

## Files intentionally changed

- `index.html`
- `app.js`
- `app.css`
- `css/app.css`
- `package.json`
- `package-lock.json`
- `README.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `ROLLBACK.md`
- `TEST_PLAN.md`
- `tests/mobile-ui-positioning.test.mjs`
- `tests/navigation-regression.test.mjs`
- `tests/release-regression.test.cjs`
- `tests/stable-baseline.test.mjs`
- `checksums/runtime-critical.sha256`
- `checksums/maintenance-7A.sha256`
- `MAINTENANCE_7A_RELEASE_MANIFEST.md`
- `MAINTENANCE_7A_TEST_REPORT.md`

## Explicitly unchanged

- browser storage keys, schemas, migrations, backups, and saved records;
- AI prompts, model selection, paid-endpoint access control, body limits, and rate guards;
- Apex telemetry, connector logic, and data minimization;
- Aquarium Observer UI, APIs, Blob storage, and Raspberry Pi services;
- Vercel routes, environment variables, dependencies, and 12-function count.

## Rollback

Restore or promote the verified `4.3.40 / Maintenance 6F` deployment. No Raspberry Pi or Vercel environment-variable change is required for deployment or rollback.
