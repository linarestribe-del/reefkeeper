# Maintenance 5A test report

## Confirmed live verification

The deployed Maintenance 5A runtime baseline at commit `7be5d8d` was verified from the Raspberry Pi:

- `/api/apex-status` returned HTTP `200`;
- required Apex input and output names remained available;
- forbidden controller metadata was absent;
- final verification result was `PASS`;
- Home telemetry, Apex equipment states, and Ask AI live context continued to work.

## Maintenance 5A.1 validation

The release-alignment overlay was applied to a repository copy containing the confirmed Maintenance 5A runtime files, then validated with Node.js 22 and npm 10.

- Full `npm test` suite: passed
- Apex data-minimization regression: passed
- Repository-integrity check: passed
- Vercel function-count check: passed at `12/12`
- Observer, navigation, image-analysis, history, health, alert, and time-lapse regressions: passed

## Apex security regression coverage

The permanent regression test submits a representative legacy Apex payload containing:

- local source URL;
- hostname and serial;
- link key;
- hardware/software metadata;
- raw text;
- controller/device identifiers;
- allowed and unrelated inputs/outlets.

It verifies that both the stored KV record and the public status response exclude sensitive fields while retaining temperature, pH, ORP, leak state, required outlet state, and alarm state.

## Deployment scope

Maintenance 5A.1 changes no runtime file. No Raspberry Pi update, Vercel environment-variable change, or application smoke test beyond the normal post-deployment check is required.
