# Reef Keeper Maintenance 9A Test Report

## Release under test

- Application version: `4.3.47`
- Integration Core: `9A.1`
- Shared tank-event schema: `1`
- Baseline: verified `4.3.46 / Maintenance 8D`

## Automated coverage

- Full existing repository regression suite.
- JavaScript and inline-script syntax validation.
- Integration Core global API installation.
- Legacy parameter, maintenance, and completed-task migration.
- Verification that migration leaves source records unchanged.
- Stable event IDs and duplicate prevention across repeated synchronization.
- Structured and free-text filter-fleece replacement classification.
- One active filter-roll cycle and correct closure of the preceding cycle.
- Preservation of filter-roll measurements during event reconciliation.
- One-to-three-measurements-per-day configuration.
- Filter-roll learning-stage and forecast API behavior.
- Timeline event conversion for parameter, maintenance, completed, and Observer events.
- Observer Filter Roller Learning card wiring and DOM references.
- Ask AI shared-event context generation.
- Home recent-changes integration.
- Backup key inclusion and post-import resynchronization.
- Existing dual-camera Observer, R2, Apex, AI access, navigation, mobile UI, repository-integrity, and 12-function-limit safeguards.

## Required live checks

1. Existing user data is still visible after first load.
2. Existing Maintenance, Parameters, Timeline, Reports, Home, Ask AI, Apex, and Observer screens operate normally.
3. A structured Filter Roller / Fleece roll replaced entry saves once and appears once in recent changes and Timeline.
4. A plain-language “changed the fleece roll” entry starts a new cycle when no structured action is selected.
5. Reopening the app does not add duplicate Timeline events or completed filter-roll cycles.
6. Backup Contents lists Shared tank event stream and Observer filter-roll learning.
7. The Pi publisher and both Observer camera feeds continue without any Pi-side update.

## Result

Automated candidate result: PASS. Live iPhone verification is still required before treating `4.3.47` as the confirmed deployment baseline.
