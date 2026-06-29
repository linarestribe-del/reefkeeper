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
