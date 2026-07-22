# Maintenance 5A release manifest

## Release

- Application version: `4.3.32`
- Maintenance phase: **Apex Data Minimization**
- Confirmed working runtime baseline: commit `7be5d8d`
- Release-alignment follow-up: **Maintenance 5A.1**

## Purpose

Maintenance 5A reduced the information exposed by the unauthenticated `/api/apex-status` endpoint without changing the live Raspberry Pi connector or the browser code that consumes Apex telemetry. The user deployed and verified that runtime change successfully.

Maintenance 5A.1 aligns repository versioning, documentation, and permanent regression coverage with that already-deployed runtime baseline. It does not alter runtime behavior.

## Maintenance 5A runtime changes

The confirmed runtime baseline changed only these Vercel functions:

```text
api/apex-sync.js
api/apex-status.js
```

`api/apex-sync.js` stores an allowlisted Apex record rather than the complete controller payload. `api/apex-status.js` sanitizes every read, including older records already present in KV.

## Preserved compatibility

The current browser code reads:

```text
raw.istat.inputs
raw.istat.outputs
```

Maintenance 5A intentionally preserves that small shape. It contains only the named telemetry, equipment-power, leak-sensor, outlet-state, and alarm fields the current app uses.

## Removed from the response

- `apexSourceUrl`
- `rawText`
- complete raw controller data
- controller hostname
- serial number
- link key
- hardware/software and SD metadata
- controller/device identifiers such as `did`, `gid`, and `ID`
- unrelated Apex inputs and outlets

## Maintenance 5A.1 files

Maintenance 5A.1 updates only:

```text
package.json
package-lock.json
tests/release-regression.test.cjs
tests/apex-data-minimization.test.mjs
README.md
CHANGELOG.md
MAINTENANCE_5A_RELEASE_MANIFEST.md
MAINTENANCE_5A_TEST_REPORT.md
```

## Maintenance 5A.1 does not change

- `api/apex-sync.js` or `api/apex-status.js`
- any other runtime JavaScript
- `index.html`, CSS, navigation, Observer code, or AI behavior
- Raspberry Pi scripts, services, configuration, or secrets
- Apex connector configuration
- Vercel routes, function count, Blob configuration, or environment-variable names

## Rollback

Maintenance 5A.1 is metadata/test/documentation-only. If necessary, revert its single repository commit. The deployed Maintenance 5A runtime baseline at commit `7be5d8d` remains the known-good runtime state, and no Raspberry Pi rollback is required.
