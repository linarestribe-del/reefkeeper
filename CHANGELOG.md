# Reef Keeper Changelog

## v3.1.2 — Equipment Merge Fix

### Changed
- `app.js`
  - My Tank → Equip. now always merges the default installed equipment list with any saved equipment instead of choosing one or the other.
  - Saved custom equipment still stays saved.
  - Default tank equipment is backfilled into local storage so it remains visible after refresh.
- `index.html`
  - Updated script cache-busting strings so Vercel/Safari loads the new `app.js`.

### Test Checklist
- [ ] Open My Tank.
- [ ] Tap Equip.
- [ ] Equipment Manager opens.
- [ ] Installed/default equipment appears, including return pumps, heaters, skimmer, UV, GFO reactor, lights, MP40s, ATO, Apex, RODI, and mixing drum.
- [ ] Add/save a custom equipment item and confirm it remains visible with the defaults.


## v3.1.1 — My Tank Equipment Defaults Fix

### Changed
- `app.js`
  - Added a complete Equipment Manager fallback module.
  - My Tank → Equip. now shows the installed/default equipment list instead of an empty panel.
  - Added default equipment records from the current tank profile: return pumps, heaters, filter roller, skimmer, UV, reactors, lights, MP40s, DMP20, ATO, Apex, RODI, mixing drum, and kalk stirrer.
  - Added equipment save/edit/delete, category filtering, service logging, photo attachment, and simple AI Fill support.
  - Equipment service logs now save into Action History when service is logged.
- `index.html`
  - Updated script cache-busting strings so Vercel/mobile browsers load the new `app.js`.

### Test Checklist
- [ ] Open My Tank.
- [ ] Tap Equip.
- [ ] Equipment Manager opens.
- [ ] Default installed equipment appears.
- [ ] Tap an equipment card and it expands.
- [ ] Save a new equipment item.
- [ ] Log service on one equipment item.
- [ ] Confirm the app still loads Home, AI Vision, Ask AI, and More.
## v3.1.3 — My Tank Equipment Display Fix

### Changed
- `index.html`
  - Routed My Tank → Equip. through a dedicated `openMyTankEquipment()` function.
  - Forces the equipment manager to render after the overlay opens.
  - Adds a defensive equipment-list backfill so the installed/default equipment appears even if the normal renderer or stored equipment state is empty.

### Test Checklist
- [ ] My Tank → Equip. opens the Equipment overlay.
- [ ] Installed/default equipment appears without needing to add equipment manually.
- [ ] Existing saved equipment still appears.
- [ ] Fish, Coral, and Params buttons still work.

