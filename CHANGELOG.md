# Reef Keeper Changelog

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
