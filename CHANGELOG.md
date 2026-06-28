# Reef Keeper Changelog

## v4.0.0 — Apex Connect

### Goal
Begin Apex Integration with a safe read-only connection profile before importing live telemetry.

### Changed
- `index.html`
  - Adds Apex Integration settings card.
  - Adds Apex Connection shortcut under More.
  - Updates app version label to v4.0.0 Apex Connect.
  - Loads `apex-connect.js`.
- `apex-connect.js`
  - Adds local Apex connection profile storage.
  - Adds Save Apex Settings and Test Connection actions.
  - Tests the local Apex `/cgi-bin/status.json` endpoint when reachable from the browser.
  - Stores last connection-test status for Reef Brain/Apex follow-up work.
- `css/app.css`
  - Adds Apex settings, status, action, and dark-mode styles.
- `CHANGELOG.md`
  - Adds this release entry.

### Test Checklist
- [ ] More → Apex Connection opens Settings and scrolls to Apex Integration.
- [ ] Settings → Apex Integration appears.
- [ ] Save Apex Settings stores URL/username/token options.
- [ ] Test Connection shows Connected if the Apex responds.
- [ ] Test Connection shows a useful warning if local-network/CORS blocks the browser request.
- [ ] Home still loads.
- [ ] My Tank still opens.
- [ ] Reef Timeline still opens.
- [ ] Ask AI still works.
- [ ] Dark mode remains readable.

## v3.9.2 — Polish & Performance

### Goal
Stabilize the intelligence layer before beginning v4.0 Apex Integration.

### Changed
- `reef-brain.js`
  - Updates Reef Brain to v3.9.2.
  - Adds short-lived snapshot caching to reduce repeated localStorage reads and duplicate score calculations during page renders.
  - Adds `getReefBrainScore()` compatibility helper so legacy dashboard code uses the same single Reef Brain score.
  - Keeps `refresh()` available as a forced fresh snapshot for manual refresh actions.
- `index.html`
  - Updates cache-busting strings for v3.9.2 assets.
- `CHANGELOG.md`
  - Adds this release entry.

### Test Checklist
- [ ] Home loads with one score only.
- [ ] Daily Reef Assistant still renders.
- [ ] Reef Status, AI Monitoring, and Last Test still route correctly.
- [ ] My Tank opens and counts render.
- [ ] Equipment Manager opens and equipment intelligence renders.
- [ ] Reef Timeline opens, searches, and filters.
- [ ] AI Vision still saves analysis/history.
- [ ] Ask AI still includes tank context.
- [ ] Days-Off Plan still generates and respects Reef Brain context.
- [ ] Dark mode remains readable.

## v3.9.2 — Polish & Performance

### Goal
Stabilize the intelligence layer before beginning v4.0 Apex Integration.

### Changed
- `reef-brain.js`
  - Updates Reef Brain to v3.9.2.
  - Adds short-lived snapshot caching to reduce repeated localStorage reads and duplicate score calculations during page renders.
  - Adds `getReefBrainScore()` compatibility helper so legacy dashboard code uses the same single Reef Brain score.
  - Keeps `refresh()` available as a forced fresh snapshot for manual refresh actions.
- `index.html`
  - Updates cache-busting strings for v3.9.2 assets.
- `CHANGELOG.md`
  - Adds this release entry.

### Test Checklist
- [ ] Home loads with one score only.
- [ ] Daily Reef Assistant still renders.
- [ ] Reef Status, AI Monitoring, and Last Test still route correctly.
- [ ] My Tank opens and counts render.
- [ ] Equipment Manager opens and equipment intelligence renders.
- [ ] Reef Timeline opens, searches, and filters.
- [ ] AI Vision still saves analysis/history.
- [ ] Ask AI still includes tank context.
- [ ] Days-Off Plan still generates and respects Reef Brain context.
- [ ] Dark mode remains readable.

## v3.9.1 — Reef Brain Intelligence

### Goal
Make Reef Brain explain the tank score, detect parameter trends, and produce smarter daily priorities from existing tank data.

### Changed
- `reef-brain.js`
  - Adds parameter trend analysis for phosphate, alkalinity, nitrate, calcium, magnesium, pH, and salinity.
  - Adds score explanation output so the app can explain why the score moved.
  - Improves Daily Reef Assistant priorities using trends, maintenance due items, equipment due items, reminders, and Reef Timeline photo age.
  - Adds estimated priority time and urgent priority count to the Reef Brain snapshot.
  - Adds trend insights and score explanations to Ask AI / Days-Off context.
- `index.html`
  - Updates Reef Brain cache-busting version.

### Test Checklist
- [ ] Home loads normally.
- [ ] Tank score still appears once.
- [ ] Daily Reef Assistant shows useful priorities.
- [ ] Ask AI still works.
- [ ] Days-Off Plan still generates.
- [ ] My Tank, AI Vision, and Reef Timeline still open.


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
