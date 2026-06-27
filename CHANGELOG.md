# Reef Keeper Changelog

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
