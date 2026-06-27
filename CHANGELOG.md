# Reef Keeper Changelog

## v2.1.1 — Background + My Tank Repair

### Changed
- `index.html`
  - Scoped the My Tank section selector so it only appears on the My Tank page.
  - Removed the floating/sticky My Tank selector behavior that was causing layout overlap.
  - Rebuilt the My Tank page as a compact page with local section buttons.
  - Updated cache-busting strings to v2.1.1.
- `assets/images/reef-background.png`
  - Replaced the experimental/cartoon background with a clean reef background asset only.
  - No UI elements are embedded in the background image.

### Test Checklist
- [ ] Home loads without duplicate UI in the background.
- [ ] My Tank shows only one Fish / Coral / Equip. / Params selector.
- [ ] AI Vision does not show the My Tank selector.
- [ ] Ask AI does not show the My Tank selector.
- [ ] More does not show the My Tank selector.
- [ ] Fish opens the livestock catalog.
- [ ] Coral opens the coral catalog.
- [ ] Equip. opens the equipment manager.
- [ ] Params opens parameter logging.
