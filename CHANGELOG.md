# Reef Keeper Changelog

## v2.0.5 — Background-only reef image fix

### Changed
- `index.html`
  - Uses `assets/images/reef-background.png` as the app background.
  - Hides the old CSS ocean decorations so the image is the background layer.

### Added / Replaced
- `assets/images/reef-background.png`
  - Replaced the full mockup screenshot with a background-only image so app cards and titles do not duplicate behind the real UI.

### Test Checklist
- [ ] Home no longer shows duplicated Reef Keeper text behind the real header.
- [ ] My Tank no longer shows Tank Score/card artwork behind the real My Tank content.
- [ ] Bottom navigation is readable.
- [ ] Cards remain readable on the reef background.
