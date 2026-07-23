# Reef Keeper Maintenance 8C Test Report

## Release under test

- Application version: `4.3.45`
- Observer publisher: `2.4`
- Observer schema: `8`
- Baseline: verified `4.3.44 / Maintenance 8B`

## Automated coverage

- Full existing repository regression suite.
- JavaScript and inline-script syntax checks.
- Duplicate global-function and DOM-reference integrity checks.
- Vercel function limit check at 12/12.
- Python publisher syntax and existing daily-summary retry-budget tests.
- Local image metrics from deterministic synthetic grayscale frames.
- Brightness-normalized baseline comparison.
- Small camera-shift detection with shift compensation.
- Horizontal water-line detection and confidence scoring.
- Repeated-frame obstruction confirmation.
- Repeated-frame water-level alert confirmation.
- Observer schema normalization for local monitoring metrics.
- Deterministic operational alert mapping for camera framing and urgent water-level conditions.
- Required Observer UI elements and diagnostic integration.
- Verification that the per-frame publisher contains no OpenAI or ChatGPT call.
- Publisher installer shell syntax, systemd `ExecStart` path discovery, pinned download checksums, controlled-publish verification, and automatic rollback markers.

## Required live checks

After web deployment and Publisher 2.4 installation:

1. Controlled publish exits successfully and writes a fresh `publisherVersion: 2.4` status.
2. Publisher timer returns to active and enabled.
3. Current sump image remains available through Cloudflare R2.
4. Local visual monitor initially reports learning, then image quality and scene stability become healthy after repeated stable captures.
5. No unexpected obstruction, framing, scene, or water-level alert appears.
6. Water-level monitoring remains Not set until explicitly calibrated.
7. Existing daily summary, comparisons, alerts, timelapses, Apex, Ask AI, and navigation remain functional.

## Result

Candidate automated result: PASS, subject to the controlled Pi installation and live iPhone checks above.
