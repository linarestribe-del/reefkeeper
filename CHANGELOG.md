# Reef Keeper Changelog

## v3.6.1 — Single Reef Score Fix

### Goal
Remove the duplicate score shown in the lower AI Tank Dashboard so Home uses one Reef Brain score everywhere.

### Changed
- `app.js`
  - Updated the AI Tank Dashboard to stop rendering its own separate circular score.
  - Reuses the main Reef Brain score for score-detail wording.
  - Converts the lower dashboard into an explanation panel: latest parameters, watch items, vision status, why-not-100, and next action.

### Test Checklist
- [ ] Home shows only one large score at the top.
- [ ] AI Tank Dashboard no longer shows a second circular score.
- [ ] AI Tank Dashboard explains the same main score.
- [ ] Open Reef Timeline button works.
- [ ] Add Full-Tank Photo button works.
