# Reef Keeper Maintenance 8B Test Report

## Candidate

- Version: `4.3.44`
- Baseline: verified `4.3.43 / Maintenance 8A`
- Test date: July 22, 2026

## Automated verification

The candidate must pass the complete `npm test` suite, including all prior maintenance, R2, Observer, AI, Apex, repository, and Vercel-function checks, plus:

- daily-summary retry decision and reset behavior;
- three-attempt maximum and delayed retry enforcement;
- deterministic operational-alert generation;
- filtering of informational health events;
- publisher-staleness escalation;
- schema 7 daily-monitoring normalization;
- Daily monitoring DOM and Observer UI integration.

## Live verification

1. Deploy the small web overlay and confirm Vercel is Ready.
2. Confirm Observer current image, health, visual summary, and existing alerts still load.
3. Install publisher version 2.3 on the Pi without changing publisher credentials.
4. Run the publisher service once manually and confirm `PUBLISH_OK`, `publisherVersion: 2.3`, and a Daily monitoring state.
5. Re-enable or restart the publisher timer and confirm a scheduled publish succeeds.

## Result

`PASS WITH PI-SIDE ACTIVATION REQUIRED` — the complete automated suite passed, including all prior regressions, the new retry-budget tests, operational-alert tests, repository integrity, and the Vercel 12/12 function check.

The container Chromium process did not terminate reliably during an optional full-page smoke run, so that run was not counted as a pass. JavaScript syntax, inline scripts, DOM references, and Observer runtime logic were verified by the standard automated suite. Final iPhone verification remains part of live activation.
