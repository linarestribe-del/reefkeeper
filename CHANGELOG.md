# Reef Keeper Changelog

## v3.9.0 — Timeline Intelligence

### Goal
Make the Reef Timeline more than a chronological feed by adding interpreted reef-history summaries, trend markers, milestones, and category-specific intelligence.

### Changed
- `index.html`
  - Adds a Timeline Intelligence panel inside Reef Timeline.
  - Adds milestone cards below the timeline controls.
  - Adds Fish and Coral filters to the timeline filter menu.
  - Updates cache-busting for `app.css` and `reef-timeline.js`.
- `reef-timeline.js`
  - Upgrades the timeline engine from v3.8.0 to v3.9.0.
  - Adds parameter trend markers between consecutive water tests.
  - Adds after-effect markers for water-change entries when nearby parameter logs exist.
  - Adds photo comparison summaries using the two newest reef photos or AI Vision entries.
  - Adds monthly timeline summaries.
  - Adds milestone generation for tank age, water-test history, photo history, maintenance history, and next milestones.
  - Adds focused history helpers for coral, fish, and equipment records.
  - Adds intelligence notes directly inside applicable timeline entries.
  - Keeps Home “What Changed Recently” fed from the unified timeline.
- `css/app.css`
  - Adds styling for Timeline Intelligence cards, milestone cards, intelligence notes, and fish/coral timeline subtype accents.
  - Adds dark-mode support for the new timeline intelligence components.

### Test Checklist
- [ ] My Tank → Reef Timeline opens normally.
- [ ] Timeline Intelligence panel appears above the add-photo section.
- [ ] Milestone cards appear when timeline data exists.
- [ ] All events filter still works.
- [ ] Photos / AI Vision filter works.
- [ ] Parameters filter works and shows trend markers when multiple water tests exist.
- [ ] Fish filter works.
- [ ] Coral filter works.
- [ ] Equipment filter works.
- [ ] Home → What Changed Recently still shows recent timeline entries.
- [ ] Dark mode remains readable.

### Known Notes
- This release uses existing local app data only. It does not add a new database schema.
- “Monthly summary” is generated locally from timeline records, not from a new OpenAI API call.
