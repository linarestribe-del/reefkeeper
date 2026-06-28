# Reef Keeper Changelog

## v3.8.0 — Reef Timeline

### Goal
Create one chronological reef memory feed from the app data you already log.

### Changed
- `index.html`
  - Renames Visual Tank History to Reef Timeline.
  - Adds timeline search and event filters.
  - Changes My Tank → Reef Timeline to open the timeline instead of AI Vision.
  - Keeps full-tank photo upload inside the timeline as an expandable action.
- `reef-timeline.js`
  - New unified timeline module.
  - Pulls events from parameter logs, maintenance/action history, completed tasks, AI Vision/full-tank photos, livestock entries, livestock photo analyses, and equipment service records.
  - Replaces the Home “What Changed Recently” list with the newest timeline events.
- `css/app.css`
  - Adds styling for timeline controls, grouped date headers, event type accents, and the expandable full-tank photo form.

### Test Checklist
- [ ] Home loads normally.
- [ ] What Changed Recently shows timeline events.
- [ ] My Tank → Reef Timeline opens the timeline.
- [ ] Timeline search filters entries.
- [ ] Timeline event type filter works.
- [ ] Add full-tank photo still saves.
- [ ] AI Vision save to full-tank history still appears in the timeline.
- [ ] Dark mode remains readable.

## v3.7.0 — Equipment Intelligence

### Goal
Turn the Equipment Manager from a static gear list into a service-aware equipment dashboard.

### Changed
- `index.html`
  - Adds Equipment Intelligence cards inside the Equipment Manager.
  - Shows each item as On track, Due soon, Overdue, or Needs baseline.
  - Adds last service, interval, source, and service recommendation details.
  - Adds Log Service and Ask AI actions to equipment cards.
  - Keeps My Tank → Equipment Manager as the entry point.
- `reef-brain.js`
  - Adds equipment intelligence to the Reef Brain snapshot.
  - Includes due/soon equipment in the Daily Reef Assistant and AI context.
  - Makes equipment status available to Home, Days-Off Plan, Ask AI, and future reports.
- `css/app.css`
  - Adds styling for Equipment Intelligence summaries, recommendation banners, and status colors.
- `app.js`
  - Included unchanged from the latest single-score cleanup baseline for safe branch upload consistency.

### Test Checklist
- [ ] Home loads and keeps one score only.
- [ ] My Tank opens normally.
- [ ] My Tank → Equipment Manager opens.
- [ ] Equipment list appears.
- [ ] Equipment cards show On track / Due soon / Overdue status.
- [ ] Log Service updates the card and action history.
- [ ] Ask AI from an equipment card opens Ask AI with equipment context.
- [ ] Daily Reef Assistant still renders.
- [ ] Dark mode still looks readable.
