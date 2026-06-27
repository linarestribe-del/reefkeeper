# Reef Keeper Changelog

## v2.1 — UI Stabilization

### Changed
- `index.html`
  - Keeps the My Tank selector scoped to the My Tank page only.
  - Prevents the My Tank selector from appearing on AI Vision, Ask AI, and More.
  - Removes the failed screenshot-as-background experiment.
  - Uses a true background-only reef image asset instead of a UI mockup screenshot.
  - Updates cache-busting strings for this stabilization build.

### Added
- `assets/images/reef-background.png`
  - Reef background asset with water, rays, coral edges, bubbles, and clownfish only.
  - No app UI, text, cards, or navigation are baked into the background.

### Test Checklist
- [ ] Home loads without duplicated logo/cards.
- [ ] My Tank shows its Fish / Coral / Equip. / Params selector only on My Tank.
- [ ] AI Vision does not show the My Tank selector.
- [ ] Ask AI does not show the My Tank selector.
- [ ] More does not show the My Tank selector.
- [ ] Background appears behind the app without duplicated UI.
- [ ] Bottom navigation still works.
