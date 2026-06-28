# Reef Keeper Changelog

## v3.5.0 — Reef Brain Foundation

### Goal
Create one shared intelligence layer that summarizes the reef once, then lets Home, Ask AI, Days-Off Planner, reports, and future features use the same source of truth.

### Changed
- `reef-brain.js`
  - Added the Reef Brain snapshot service.
  - Reads parameter logs, reminders, maintenance due dates, inventory, equipment, visual history, completed work, and recent actions.
  - Produces a shared score, reef status, today list, watch list, last-test age, inventory summary, and AI context lines.
  - Injects Reef Brain context into Ask AI and Days-Off Planner context when those functions are available.
- `index.html`
  - Loads the new Reef Brain module.
  - Home dashboard now renders from `ReefKeeperBrain.getSnapshot()` instead of duplicating separate scoring/watch logic.
  - Keeps a fallback renderer if the module fails to load.

### Test Checklist
- [ ] Home loads and shows Reef Status, AI Monitoring, Last Test, Today, and AI Watching.
- [ ] Reef Status and AI Monitoring still scroll/highlight correctly.
- [ ] + Water Test and + Maintenance still route to different log forms.
- [ ] Ask AI still sends messages normally.
- [ ] Days-Off Plan still generates.
- [ ] My Tank, AI Vision, and More still open normally.

## v3.4.2 — Home Action Routing Fix

### Changed
- `index.html`
  - Reef Status now scrolls to/highlights the AI Tank Dashboard instead of doing nothing visible.
  - AI Monitoring now scrolls to/highlights the AI Watching panel.
  - `+ Water Test` now opens Log Parameters and focuses the first water-test field.
  - `+ Maintenance` now opens the Maintenance / Action History form and focuses the action field.
- `css/app.css`
  - Added a brief focus pulse so shortcut destinations are obvious.

### Test Checklist
- [ ] Home → Reef Status visibly jumps/highlights the dashboard section.
- [ ] Home → AI Monitoring visibly jumps/highlights the AI Watching section.
- [ ] Home → + Water Test opens the parameter form.
- [ ] Home → + Maintenance opens the maintenance/action form.
- [ ] My Tank, AI Vision, Ask AI, and More still open normally.

## v3.4.1 — Home Status Chips

### Changed
- Replaced the awkward Home dashboard summary sentence with three compact status chips.
- Updated Home greeting to “Welcome back 👋”.
- Reduced the app header height slightly to give the dashboard more room.
- Made Last Test chip open the parameter log.

### Test Checklist
- [ ] Home says “Welcome back 👋”.
- [ ] Home shows Reef Status, AI Monitoring, and Last Test chips.
- [ ] No awkward sentence appears under Today’s Reef Brief.
- [ ] Last Test chip opens logging/parameters.
- [ ] Dark mode still looks readable.


## v3.4.0 — Home Dashboard Intelligence

### Changed
- `index.html`
  - Added a new Today's Reef Brief card at the top of Home.
  - Added live tank-health score, Today list, AI Watching list, and quick actions.
  - The Home brief reads latest parameters, active reminders, Maintenance Engine due tasks, and Reef Timeline photo history when available.
  - Added defensive render hooks so the brief refreshes when returning to Home.
- `css/app.css`
  - Added polished Home dashboard styles for the intelligence card, score pill, status panels, and quick action buttons.

### Test Checklist
- [ ] Home loads normally.
- [ ] Today's Reef Brief appears under the greeting.
- [ ] Tank score displays.
- [ ] Today list displays reminders/maintenance or a safe fallback.
- [ ] AI Watching displays parameter/photo/maintenance observations.
- [ ] Quick Actions open Water Test, Maintenance, AI Vision, and Ask AI.
- [ ] My Tank still looks like v3.3.1.
- [ ] Dark mode remains readable.

## v3.3.1 — My Tank Simplification

### Changed
- Removed the redundant Fish / Coral / Equip. / Params pill bar from My Tank.
- Replaced the four stat tiles with a compact informational summary strip.
- Kept the large My Tank cards as the primary navigation.
- Renamed Visual Tank History to Reef Timeline.
- Renamed Maintenance Schedule to Maintenance Planner.

### Test Checklist
- [ ] My Tank no longer shows the bottom Fish / Coral / Equip. / Params pill bar.
- [ ] Fish & Livestock opens the livestock catalog.
- [ ] Coral Inventory opens coral inventory.
- [ ] Equipment Manager opens installed gear.
- [ ] Parameters Log opens parameter logging.
- [ ] Reef Timeline opens AI Vision.
- [ ] Maintenance Planner opens reminders / days-off planning.


## v3.3.0 — My Tank Hub

### Changed
- `index.html`
  - Rebuilt the My Tank page into a control-center hub instead of a single helper card.
  - Added My Tank overview stats for fish, coral, installed equipment, and latest parameter log age.
  - Added primary section cards for Fish & Livestock, Coral Inventory, Equipment Manager, and Parameters Log.
  - Added secondary links for Targets & scoring, Visual Tank History, and Maintenance Schedule.
  - Added resilient My Tank rendering so counts still populate even if saved data is partial.
- `css/app.css`
  - Added scoped My Tank hub styling.
  - Preserved the bottom quick section selector without affecting other pages.

### Test Checklist
- [ ] Home still loads correctly.
- [ ] My Tank shows the new overview card and section cards.
- [ ] Fish & Livestock opens the fish catalog.
- [ ] Coral Inventory opens the coral catalog.
- [ ] Equipment Manager opens installed equipment.
- [ ] Parameters Log opens parameter logging.
- [ ] AI Vision, Ask AI, and More do not show the My Tank selector.
- [ ] Dark mode still looks readable.


## v3.2.0 — Phase 2 CSS Refactor

### Changed
- `index.html`
  - Removed the large inline `<style>` block.
  - Added a stylesheet link to `css/app.css`.
  - Updated cache-busting strings to v3.2.0.
  - Updated the visible version label in Settings.
- `css/app.css`
  - New stylesheet containing the app's existing CSS.
  - Background image paths were adjusted for the new `css/` folder location.

### Not Changed
- No feature behavior was intentionally changed.
- No API files were changed.
- No app data/storage keys were changed.
- No visual redesign was intended.

### Test Checklist
- [ ] Home loads normally.
- [ ] Background still appears.
- [ ] Bottom navigation works.
- [ ] My Tank opens and each section works.
- [ ] My Tank → Equip. shows installed/default equipment.
- [ ] AI Vision opens.
- [ ] Ask AI opens.
- [ ] More/settings open.

## v3.1.2 — Equipment Merge Fix

### Changed
- `app.js`
  - My Tank → Equip. now always merges the default installed equipment list with any saved equipment instead of choosing one or the other.
  - Saved custom equipment still stays saved.
  - Default tank equipment is backfilled into local storage so it remains visible after refresh.
- `index.html`
  - Updated script cache-busting strings so Vercel/Safari loads the new `app.js`.

### Test Checklist
- [ ] Open My Tank.
- [ ] Tap Equip.
- [ ] Equipment Manager opens.
- [ ] Installed/default equipment appears, including return pumps, heaters, skimmer, UV, GFO reactor, lights, MP40s, ATO, Apex, RODI, and mixing drum.
- [ ] Add/save a custom equipment item and confirm it remains visible with the defaults.


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
## v3.1.3 — My Tank Equipment Display Fix

### Changed
- `index.html`
  - Routed My Tank → Equip. through a dedicated `openMyTankEquipment()` function.
  - Forces the equipment manager to render after the overlay opens.
  - Adds a defensive equipment-list backfill so the installed/default equipment appears even if the normal renderer or stored equipment state is empty.

### Test Checklist
- [ ] My Tank → Equip. opens the Equipment overlay.
- [ ] Installed/default equipment appears without needing to add equipment manually.
- [ ] Existing saved equipment still appears.
- [ ] Fish, Coral, and Params buttons still work.

