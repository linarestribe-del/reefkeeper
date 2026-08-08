# Reef Keeper Maintenance 9M — Return Water-Level Reliability

Version: v4.3.69
Publisher: 2.8.3

## Purpose

Maintenance 9M prevents the return chamber water-level edge detector from falsely marking the return camera offline when the detector alternates between two possible horizontal edges. Return camera capture, image publishing, and scene/image health remain separate from optional water-level tracking.

## Changed files

- `index.html`
- `package.json`
- `package-lock.json`
- `connector/observer-publisher.py`
- `connector/install-observer-publisher-2.8.3.sh`
- `tests/observer-9m-return-water-level-reliability.test.mjs`
- `tests/stable-baseline.test.mjs`
- `tests/release-regression.test.cjs`
- `tests/observer-dual-camera.test.mjs`
- `tests/observer-health.test.mjs`
- `tests/observer-local-monitor-ui.test.mjs`
- `tests/observer-9e1-followup.test.mjs`
- `tests/observer-9h-data-saver.test.mjs`
- `tests/observer-9i-filter-roll-reliability.test.py`
- `tests/filter-roll-status.test.mjs`
- `tests/observer-9k2-daily-summary.test.mjs`
- `tests/observer-9l-filter-roll-physical.test.mjs`
- `tests/observer-9l1-physical-priority.test.mjs`

## Behavior changes

- Water-level tracking disabled state is explicit and healthy.
- Ambiguous return waterline edge jumps move to `tracking_paused`/`pending` instead of false urgent/offline.
- Confirmed water-level differences are warnings by default; they do not force `returnCameraOk: false` unless `allow_offline` is explicitly enabled in the private Pi config.
- The return chamber page text now describes water-level tracking as optional and return timelapse as active.
- GitHub CI baseline/release tests are updated for v4.3.69 and Publisher 2.8.3.

## Not changed

- Cloudflare Worker/R2 media routing.
- Timelapse builder 1.2.
- Filter-roll physical estimate logic.
- Sump overview anchor-zone tuning.
