# Reef Keeper Changelog

## v3.6.2 — Single Score Cleanup

### Goal
Home should show only one reef score in the app.

### Changed
- `app.js`
  - Removed the remaining score detail row from AI Tank Dashboard.
  - AI Tank Dashboard now explains latest parameters, monitoring, vision, and next actions without repeating the score.
- `CHANGELOG.md`
  - Added this release note.

### Test Checklist
- [ ] Home shows only one score, in Today’s Reef Brief.
- [ ] AI Tank Dashboard does not mention another score.
- [ ] Latest Parameters, AI Monitoring, AI Vision, and What’s Next still display.
- [ ] Home quick actions still route correctly.
