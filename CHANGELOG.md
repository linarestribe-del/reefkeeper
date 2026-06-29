# Reef Keeper v4.3.0 — Live Reef Dashboard

## Added
- Live controller-style tank health card powered by Apex telemetry.
- Automatic outlet classification by Apex outlet name/type.
- Live equipment dashboard grouped by Return, Filtration, Flow, Heating, Cooling, ATO, Reactors, Dosing, Lighting, Safety, Accessory, and Other.
- Probe status interpretation for temperature, pH, ORP, and salinity.
- Basic telemetry health scoring with age, alarm, probe, and critical-equipment checks.
- Local controller event capture for outlet state changes and large temperature changes.

## Improved
- Home Live Telemetry now acts like a dashboard instead of a raw telemetry display.
- Preview branches continue to read from the stable telemetry hub established in v4.2.x.
- Equipment handling is no longer dependent on exact hardcoded outlet lists.

## Notes
- This release builds on v4.2.1 telemetry hardening.
- Telemetry history and alert notifications are still planned for later releases.


## v4.3.1 - Live Dashboard Layout + Apex AUTO State Fix

- Fixed mobile Live Telemetry layout so the dashboard uses the full card width instead of narrow columns.
- Fixed Apex `AUTO/ON` and `AUTO/OFF` state interpretation. `AUTO/ON` now counts as normal/on for expected-running equipment.
- Treated heaters, fans, dosing pumps, accessories, and safety virtuals as allowed idle/off unless an alarm is active.
- Improved probe and equipment chip wrapping for mobile screens.
