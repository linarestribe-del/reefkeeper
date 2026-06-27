# Reef Keeper Changelog

## v2.0.4 — Exact Background Image

### Changed
- `index.html`
  - Uses the selected reef mockup image directly as the app background.
  - Disables the older CSS-generated bubbles, rays, seaweed, and reef framing so the chosen image is what shows behind the app.

### Added
- `assets/images/reef-background.png`
  - The exact image file used by the app background.

### Upload Notes
- Upload/replace `index.html`.
- Add the folder path `assets/images/reef-background.png` to GitHub.

### Test Checklist
- [ ] Home loads normally.
- [ ] Background image appears behind the app.
- [ ] Bottom navigation remains readable.
- [ ] My Tank opens normally.
- [ ] AI Vision opens normally.


## v2.0.3 — Reef Background Update

### Changed
- `index.html`
  - Replaced the plain ocean gradient with a brighter reef-style background.
  - Added top light rays, deeper blue water, bubble highlights, and coral-colored side framing using CSS.
  - Hid the older seaweed/sand/emoji background layer so the app looks cleaner.

### Test Checklist
- [ ] Home loads normally.
- [ ] Background appears behind all screens.
- [ ] Cards remain readable.
- [ ] Bottom navigation remains visible.
- [ ] Dark mode still opens without unreadable text.
