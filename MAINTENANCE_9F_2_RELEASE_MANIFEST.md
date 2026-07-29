# Reef Keeper v4.3.57 — Maintenance 9F.2

## Scope

Maintenance 9F.2 is an app-only wording update over v4.3.56. It clarifies the Filter-Roll warning shown when the latest camera attempt is rejected but a prior accepted camera reading still exists.

## Changed behavior

- If a previous accepted camera measurement exists, the warning says the estimate remains based on that last accepted reading.
- If no accepted camera measurement exists, the warning says the estimate remains based on the saved manual starting measurement.
- Rejected-attempt details remain visible.

## Not changed

- Publisher remains 2.8.0.
- No Raspberry Pi update is required.
- Filter-roll acceptance thresholds and schedule are unchanged.
