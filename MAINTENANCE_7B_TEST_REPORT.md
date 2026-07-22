# Reef Keeper Maintenance 7B Test Report

## Candidate

- Version: `4.3.42`
- Baseline: verified `4.3.41 / Maintenance 7A`
- Test date: July 22, 2026

## Automated verification

The candidate must pass the complete `npm test` suite, including:

- JavaScript and inline-script syntax checks;
- global-function and DOM-reference integrity;
- root status-canvas, safe-area metadata, scrollable-header, and Ask AI answer-positioning checks;
- all prior maintenance regressions;
- AI access-control and abuse guards;
- Apex and Aquarium Observer tests;
- repository integrity and the Vercel 12-function limit.

## Required iPhone verification

1. Fully close and reopen the installed Reef Keeper app.
2. Confirm the reef artwork or its matching blended fallback replaces the solid dark-blue status strip.
3. Confirm the title/tagline still scroll with the page.
4. Confirm bottom navigation remains fixed.
5. Confirm a long Ask AI answer still opens at its beginning.

## Result

`PASS WITH DEVICE CHECK REQUIRED` — the complete automated suite passed; the installed iPhone app must confirm the status-area presentation.
