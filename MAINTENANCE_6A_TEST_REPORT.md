# Reef Keeper Maintenance 6A Test Report

## Candidate

- Version: `4.3.35`
- Baseline: verified `4.3.34 / Maintenance 5C`
- Test date: July 21, 2026
- Node.js: `v22.16.0`
- npm: `10.9.2`

## Scope verified

- The retired v4.3.38, v4.3.39, and v4.3.40 inline layout patch blocks are absent.
- The fixed-navigation declarations formerly embedded in the v4.3.28 Home block are removed from that feature-specific block.
- Exactly one canonical `reefkeeper-app-shell-navigation` block remains.
- The canonical block preserves the fixed bottom navigation, clickability, safe-area clearance, single `.app-content` scroll container, Home clearance, and non-Home page growth behavior.
- Dead selectors for `.tab-bar`, `.bottom-tabs`, `.nav-tabs`, and `#bottom-nav` are absent.
- `index.html` is 76 lines and 1,477 bytes smaller than the verified Maintenance 5C baseline.
- Navigation JavaScript, API functions, Vercel routes, AI access control, Apex, Observer, and Raspberry Pi files are unchanged.

## Automated verification

The full `npm test` suite passed, including:

- evidence, decision, explainability, trend, and chart tests;
- navigation regression tests;
- the new index layout cleanup regression test;
- release regression tests;
- chat image and multi-image UI tests;
- all Aquarium Observer UI, publishing, history, health, daily summary, alert, and time-lapse tests;
- Apex data-minimization tests;
- Maintenance 5B AI abuse-guard tests;
- Maintenance 5C AI access-control tests;
- Raspberry Pi time-lapse selection tests;
- repository-integrity checks;
- Vercel function count: `12/12`.

Additional static checks passed:

- `node --check app.js`;
- `node --check tests/index-layout-cleanup.test.mjs`;
- unique HTML IDs;
- canonical layout block count and retired-block absence.

## Device smoke test still required

After deployment, verify on the iPhone:

1. Bottom tabs remain visible and tappable on Home and every other tab.
2. Home scrolls to the bottom without excess clipping.
3. My Tank, AI Vision, Ask AI, More, Parameter Log, Reminders, and Settings each scroll fully.
4. Parameters Log opens from My Tank.
5. The header and floating up-arrow return the active page to the top.
6. One normal Ask AI request succeeds with the existing Maintenance 5C key.

## Result

`PASS — ready for controlled deployment and device smoke testing.`
