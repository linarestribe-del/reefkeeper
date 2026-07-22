# Reef Keeper Maintenance 6B Test Report

## Candidate

- Version: `4.3.36`
- Baseline: user-verified `4.3.35 / Maintenance 6A`
- Test date: July 21, 2026
- Node.js: `v22.16.0`
- npm: `10.9.2`

## Scope verified

- Seven removed helpers have no remaining definitions or call sites.
- The retired `__homeIntelWrapped`, `oldShowPage`, and `oldShowWorkspace` layers are absent.
- The duplicate forced `window.load` Home renderer is absent.
- One canonical DOM-ready Home render remains and keeps both public renderer functions available.
- The working `showPage` → `rkDirectGo` navigation path is unchanged.
- `index.html` is 92 lines and 4,024 bytes smaller than the verified Maintenance 6A baseline.
- `app.js`, app-shell CSS, API functions, Vercel routes, AI access control, Apex, Observer, and Raspberry Pi files are unchanged.

## Automated verification

The full `npm test` suite passed, including:

- evidence, decision, explainability, trend, and chart tests;
- navigation and Maintenance 6A layout regression tests;
- the new inline JavaScript cleanup regression test;
- release regression tests;
- chat image and multi-image UI tests;
- all Aquarium Observer UI, publishing, history, health, daily summary, alert, and time-lapse tests;
- Apex data-minimization tests;
- Maintenance 5B AI abuse-guard tests;
- Maintenance 5C AI access-control tests;
- Raspberry Pi time-lapse selection tests;
- repository-integrity checks;
- Vercel function count: `12/12`.

## Chromium runtime smoke test

A mobile-size Chromium session loaded the complete application with local scripts inlined and API responses safely mocked.

Verified results:

- no JavaScript page errors;
- Home loaded as the active page;
- My Tank, Parameter Log, Settings, Home, and Ask AI navigation activated the correct page;
- Parameter Log and Settings continued to select the More navigation group;
- the seven removed helpers were all absent from `window`;
- the Home score and telemetry fallback rendered;
- one Home navigation invoked Home intelligence once and telemetry once.

For comparison, the Maintenance 6A baseline invoked Home intelligence twice and telemetry three times for the same navigation sequence.

## Device smoke test still required

After deployment, verify on the iPhone:

1. Home opens normally and displays Reef Status and Live Apex.
2. Bottom-tab navigation and scrolling still pass the Maintenance 6A checks.
3. My Tank → Parameter Log opens normally.
4. Settings opens and still shows the saved AI access-key status.
5. One Ask AI request succeeds.

## Result

`PASS — ready for controlled deployment and device smoke testing.`
