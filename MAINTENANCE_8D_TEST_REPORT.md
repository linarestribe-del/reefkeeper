# Reef Keeper Maintenance 8D Test Report

## Release under test

- Application version: `4.3.46`
- Observer publisher: `2.5`
- Observer schema: `9`
- Baseline: verified `4.3.45 / Maintenance 8C`

## Automated coverage

- Full existing repository regression suite.
- JavaScript, inline-script, and Python syntax checks.
- Dual-camera status normalization with backward-compatible overview fields.
- Separate private R2 read/write paths for overview and return images.
- Overview and return publish API merge behavior.
- Return image route validation and latest-only slot enforcement.
- Publisher 2.5 return-camera capture, monitoring, health, and upload payload tests.
- Credential and local-path exclusion from remote payloads.
- Independent operational alerts for overview and return-camera health issues.
- Overview / Return Chamber selector and overview-only section visibility checks.
- Dual-camera water-level calibration target selection.
- Guarded Publisher 2.5 installer markers, checksum pins, systemd path discovery, controlled dual publish, and Publisher 2.4 rollback.
- Existing daily-summary budget, local monitor, R2, Apex, AI access, navigation, repository-integrity, and Vercel function-limit tests.
- In-memory Chromium runtime smoke test for initial overview state, return-camera selection, camera-specific image URL/title, overview-only section hiding, and return to the overview state.

## Required live checks

1. Publisher 2.5 controlled install exits successfully and writes a fresh status with both camera publish results true.
2. Publisher timer returns to active and enabled.
3. Sump overview and return-chamber images each show recent independent capture times.
4. Selecting Return Chamber hides overview-only history, daily-summary, and timelapse panels.
5. Each camera shows its own capture and local-monitor health.
6. Existing overview history, daily summary, alerts, timelapses, Apex, Ask AI, and navigation remain functional.
7. Return water-level monitoring remains uncalibrated until explicitly configured.

## Result

Candidate automated result: PASS, subject to the guarded Publisher 2.5 installation and live iPhone verification above.
