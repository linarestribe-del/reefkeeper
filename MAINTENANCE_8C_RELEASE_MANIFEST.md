# Reef Keeper Maintenance 8C Release Manifest

## Release

- Application version: `4.3.45`
- Observer publisher: `2.4`
- Release family: `Maintenance 8C — Local Sump Monitoring`
- Baseline: verified `4.3.44 / Maintenance 8B` with Publisher 2.3

## Purpose

Maintenance 8C adds low-cost, local-first visual monitoring to the existing Tapo C500 and Raspberry Pi Observer pipeline. Reduced grayscale frames are evaluated on the Pi every publisher cycle. Full-resolution captures continue to remain in the local SSD archive, and no per-frame OpenAI request is introduced.

## Local monitoring checks

- Image quality and obstruction screening using exposure, contrast, texture, and repeated-frame confirmation.
- Stable-scene learning with separate dark, normal, and bright lighting baselines.
- Camera-position and persistent scene-change screening with repeated-frame confirmation.
- Optional sump water-level edge tracking inside a user-calibrated region.
- Warning and urgent water-level thresholds measured as a percentage of the calibrated region height.

## Safety boundaries

- Local visual monitoring is screening, not a safety interlock.
- No pump operation, flow rate, water chemistry, hidden leak, or equipment state is inferred from pixels.
- Obstruction, framing, and scene alerts require repeated captures before they become active.
- Water-level monitoring is disabled until a visible region and baseline are calibrated on the Pi.
- Water-level alerts must be verified by direct inspection before action.
- Camera credentials, RTSP addresses, R2 credentials, and Observer write tokens are not added to the repository or monitoring payload.

## Runtime changes

- `connector/observer-publisher.py` advances from 2.3 to 2.4.
- A private non-secret configuration file is supported at `/etc/reefkeeper-observer/monitoring.json`.
- Local baseline state is stored at `/mnt/reef-ssd/aquarium-observer/monitor-status.json`.
- `connector/observer-water-level-calibrate.py` provides explicit water-level calibration without reading or modifying publisher credentials.
- `connector/install-observer-publisher-2.4.sh` discovers the live systemd script path, verifies release checksums, creates a validated Publisher 2.3 backup, performs controlled publishes, and rolls back automatically if verification fails.
- Observer status schema advances from 7 to 8.
- The existing Observer Health and Alerts endpoints carry the compact monitoring metrics; no new Vercel function is added.
- The Observer page adds a Local sump monitoring card and a Local visual monitor health row.

## Operational alerts

The existing `/api/observer-alerts` endpoint can produce deterministic system alerts for:

- `camera_view_obstructed`
- `camera_view_shifted`
- `sump_scene_changed`
- `water_level_watch`
- `water_level_urgent`
- `local_monitor_state_error`
- `local_monitor_unavailable`

These alerts use Pi-generated metrics and do not call OpenAI.

## Deployment order

1. Deploy the v4.3.45 web update while Publisher 2.3 remains active.
2. Verify Vercel is Ready and the existing Observer page still loads.
3. Run the packaged `connector/install-observer-publisher-2.4.sh` updater. It stops the timer briefly, discovers and backs up the actual script path used by systemd, and installs Publisher 2.4 plus the calibration helper.
4. Run one controlled publish and require `publisherVersion: 2.4` with a fresh status file before re-enabling the timer.
5. Confirm image quality and scene monitoring in the app.
6. Leave water-level monitoring unconfigured until the sump image region is selected and calibrated separately.

## Rollback

- Web rollback: restore `4.3.44 / Maintenance 8B`.
- Pi rollback: restore the backed-up Publisher 2.3 script at the actual systemd `ExecStart` path and re-enable `reefkeeper-observer-publish.timer`.
- Removing or disabling `/etc/reefkeeper-observer/monitoring.json` disables calibrated water-level tracking without affecting camera capture, SSD archive, R2 publishing, daily summaries, or timelapses.
