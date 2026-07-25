# Maintenance 9D Release Manifest

- Application version: `4.3.52`
- Observer publisher: `2.7.3` unchanged
- Scope: filter-roll status, current-cycle history, trend confidence, and provisional replacement forecasting

## Added behavior

- Shows the current estimated percentage remaining.
- Preserves the existing-roll initialization at 85 mm current diameter, 100 mm new-roll diameter, and 46 mm core diameter: 64.8% remaining.
- Labels the present roll as `Partial cycle — roll already in use` until a fleece replacement starts a full cycle.
- Separates the manual baseline from the latest accepted camera measurement.
- Shows recent unique measurements and retains excluded camera readings for diagnostics.
- Calculates the current-cycle usage trend and reports whether usage is normal, faster recently, slower recently, or still learning.
- Grades confidence as High, Medium, Low, or Learning and explains the limiting factors.
- Produces a provisional replacement date range only after enough reliable measurements span several days.
- Preserves completed cycles through the existing Maintenance 9A filter-roll state.

## Deployment scope

Frontend assets added:

- `filter-roll-engine.js`
- `filter-roll-status.js`
- `filter-roll-status.css`

The new assets are explicitly routed before the Vercel SPA fallback. No API route or Vercel function was added. Publisher 2.7.3, return-chamber monitoring, and unique-capture confirmation behavior are unchanged.
