# Reef Keeper Maintenance 6C Test Report

## Candidate

- Version: `4.3.37`
- Baseline: user-verified `4.3.36 / Maintenance 6B`
- Scope: tool-overlay handler delegation and Home snapshot-render consolidation

## Source verification

- Confirmed all 11 long-term tool overlays retain two scroll-to-top controls each.
- Confirmed all 22 controls retain the correct tool target through `data-scroll-tool`.
- Confirmed no retired `onclick="scrollToolToTop(...)"` attributes remain.
- Confirmed one delegated click listener invokes the existing `scrollToolToTop` helper.
- Confirmed the primary Reef Brain path and Apex fallback path both call one shared `rkHomeRenderSnapshot` implementation.
- Confirmed Home telemetry rendering is invoked once through the shared snapshot renderer.
- `index.html` changed from 4,597 to 4,578 lines and from 206,217 to 205,081 bytes.

## Automated tests

`npm test` passed in full, including:

- evidence, decision, explainability, trend, and chart modules;
- navigation and Maintenance 6A/6B/6C index regressions;
- release regression;
- Ask AI image input and multi-image behavior;
- Aquarium Observer UI, publishing, history, health, summaries, alerts, and time-lapses;
- Apex data minimization;
- Maintenance 5B abuse guards;
- Maintenance 5C AI access control;
- Raspberry Pi time-lapse selection;
- repository integrity;
- Vercel function count at `12/12`.

## Browser smoke test

A 390 × 844 Chromium mobile-layout test passed using an in-memory copy of the candidate with local runtime scripts embedded. It verified:

- More-tab navigation;
- Parameter Log navigation;
- delegated scroll-to-top behavior from the Tank Memory title;
- delegated scroll-to-top behavior from the Tank Memory top-arrow button;
- shared Home snapshot rendering for score, status, and Today content;
- the `4.3.37 / Maintenance 6C` version marker.

The smoke test used mocked local API responses and did not contact Vercel, OpenAI, Apex, or the Raspberry Pi.

## Result

`PASS` — candidate is suitable for staged Vercel deployment with `4.3.36 / Maintenance 6B` retained as the rollback baseline.
