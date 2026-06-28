# Reef Keeper Changelog

## v3.6.0 — Daily Reef Assistant

### Goal
Make the Home dashboard more proactive by adding a daily briefing generated from the Reef Brain snapshot.

### Changed
- `reef-brain.js`
  - Upgraded Reef Brain to v3.6.0.
  - Added `dailyAssistant` to the Reef Brain snapshot.
  - Daily brief now looks at parameter age, PO4, alkalinity, nitrate, maintenance due, active reminders, and Reef Timeline photo history.
  - Adds daily brief lines to Ask AI / planner context through the existing Reef Brain summary.
- `index.html`
  - Added a Daily Reef Assistant panel to Home.
  - Added clickable daily brief items that route to Water Test, Maintenance, AI Vision, or Parameter review.
  - Added a Refresh button for the daily brief.
  - Updated cache-busting strings to v3.6.0.
- `css/app.css`
  - Added Daily Reef Assistant card, bullet, and dark-mode styling.

### Test Checklist
- [ ] Home loads normally.
- [ ] Daily Reef Assistant appears under the status chips.
- [ ] Refresh updates the brief without changing pages.
- [ ] Water-test daily brief item opens the parameter form.
- [ ] Maintenance daily brief item opens the maintenance/action form.
- [ ] Vision daily brief item opens AI Vision.
- [ ] Ask AI still works.
- [ ] Days-Off Plan still generates.
- [ ] My Tank still opens correctly.
- [ ] Dark mode still looks readable.

### Known Notes
- This is a local deterministic daily brief. It does not call the OpenAI API by itself, so it should be fast and inexpensive.
