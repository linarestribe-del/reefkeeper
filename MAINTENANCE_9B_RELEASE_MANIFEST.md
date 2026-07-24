# Maintenance 9B Release Manifest

- Application version: `4.3.48`
- Maintenance release: `9B`
- Focus: Filter-roller visual measurement plumbing across the Pi publisher, Observer status payloads, and the Integration Core.

## Included changes

1. **Publisher 2.6**
   - Added private filter-roller ROI configuration support.
   - Added scheduled low-frequency measurement windows (default 3/day).
   - Publishes apparent outer/core roll radius measurements without exposing private paths.
   - Added `install-observer-publisher-2.6.sh`.

2. **Observer API/schema**
   - Schema version bumped to `10`.
   - Overview camera status now includes normalized `filterRoll` metadata.

3. **App-side integration**
   - Observer controller mirrors published filter-roller measurements into the Integration Core.
   - Integration Core now derives remaining percentage from the first measurement after a logged fleece replacement.

## Primary files changed

- `connector/observer-publisher.py`
- `connector/install-observer-publisher-2.6.sh`
- `lib/observer-common.js`
- `observer.js`
- `integration-core.js`
- `index.html`
- `package.json`
- `CHANGELOG.md`
- `tests/*` (targeted regression coverage updates)

## Deployment order

1. Deploy the web app (`v4.3.48 Maintenance 9B`).
2. After the deployment is live, run the Pi installer `connector/install-observer-publisher-2.6.sh`.
3. Configure `/etc/reefkeeper-observer/filter-roller-monitoring.json` with the overview-camera ROI when ready.
