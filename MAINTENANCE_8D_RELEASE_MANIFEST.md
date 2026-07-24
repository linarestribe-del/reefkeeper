# Reef Keeper Maintenance 8D Release Manifest

## Release

- Application version: `4.3.46`
- Observer publisher: `2.5`
- Observer schema: `9`
- Release family: `Maintenance 8D — Dual-Camera Observer`
- Baseline: verified `4.3.45 / Maintenance 8C` with Publisher 2.4

## Purpose

Maintenance 8D extends Aquarium Observer from one sump camera to two independent local camera feeds. The existing overview archive and daily visual workflows remain intact. A dedicated return-chamber feed receives its own current image, capture health, local visual monitor, and water-level calibration path.

## Camera roles

- **Sump overview:** retains the existing current image, historical comparisons, daily summary, change alerts, archive, and timelapses.
- **Return chamber:** publishes a separate current image and health record and is the default target for water-level calibration.

## Runtime changes

- Publisher advances from 2.4 to 2.5 and publishes both cameras during one authenticated cycle.
- Return-camera files are read from `/mnt/reef-ssd/aquarium-observer/return-chamber/`.
- Return local-monitor state is stored independently from the overview state.
- The shared Observer status schema advances from 8 to 9 and includes `cameras.overview` and `cameras.return` while preserving the original top-level overview fields for backward compatibility.
- The existing `/api/observer-publish`, `/api/observer-status`, and `/api/observer-image` functions accept a validated camera selector. No new Vercel function is added.
- Private R2 storage gains one fixed return-camera object path. Direct browser access remains unavailable.
- The Observer page adds an Overview / Return Chamber selector and hides overview-only history, daily-summary, and timelapse sections when the return camera is selected.
- `observer-water-level-calibrate.py` supports `--camera return|overview` and defaults to the return camera.

## Safety boundaries

- Camera credentials, RTSP URLs, local IP addresses, Observer write tokens, and R2 credentials remain outside the repository and remote status payloads.
- The return camera may report offline without preventing a successful overview publish.
- Publisher 2.5 contains no per-frame OpenAI or ChatGPT call.
- Water-level monitoring remains advisory and requires explicit calibration against a visible return-chamber reference.
- Existing overview archives are not renamed or moved.

## Deployment order

1. Deploy the v4.3.46 web update while Publisher 2.4 remains active.
2. Confirm Vercel is Ready and the existing overview feed still loads.
3. Run `connector/install-observer-publisher-2.5.sh` from the stable Reef Keeper origin.
4. Require a fresh controlled publish with both `ok: true` and `returnCameraOk: true` before the publisher timer is returned to automatic operation.
5. Confirm both camera choices show recent images and separate health.
6. Calibrate the return-chamber water-level region only after its final camera position is stable.

## Rollback

- Web rollback: restore `4.3.45 / Maintenance 8C`.
- Pi rollback: restore the validated Publisher 2.4 backup created at the actual systemd `ExecStart` path and re-enable `reefkeeper-observer-publish.timer`.
- The separate local return-camera capture service can remain active during a web or publisher rollback; Publisher 2.4 simply ignores it.
