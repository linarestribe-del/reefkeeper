# Reef Keeper Maintenance 7A Test Report

## Candidate

- Version: `4.3.41`
- Baseline: stable `4.3.40 / Maintenance 6F`
- Test date: July 22, 2026

## Automated verification

The working candidate passed:

- the complete `npm test` application and repository suite;
- JavaScript syntax validation for 66 repository files and all inline `index.html` scripts;
- global-function and DOM-reference integrity checks;
- the dedicated mobile-header and Ask AI answer-positioning regression;
- all Maintenance 6A–6F cleanup and stabilization regressions;
- AI access-control and abuse-guard tests;
- Apex data-minimization tests;
- Aquarium Observer UI, API, history, health, summary, alerts, time-lapse, and Pi builder tests;
- synchronized root and `css/` stylesheet verification;
- repository-integrity checks;
- Vercel function count at `12/12`.

## Browser limitation

The container's installed Chromium process did not complete reliably and is not counted as a passed browser test. The actual helper behavior was executed in the Node VM regression, and the structural/safe-area requirements were validated directly from the release HTML and CSS.

## Required iPhone verification

After deployment:

1. Fully close and reopen the installed Reef Keeper app.
2. Confirm the reef image extends behind the iPhone status area without the prior solid blue strip.
3. Scroll Home and confirm the complete Reef Keeper title/tagline scrolls away with the page.
4. Confirm bottom navigation remains fixed.
5. Submit an Ask AI question with a multi-paragraph answer and confirm the view lands at the beginning of the completed answer.

## Result

`PASS WITH DEVICE CHECK REQUIRED` — automated release checks pass; production verification requires the actual installed iPhone app for safe-area behavior.
