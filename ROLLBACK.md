# Reef Keeper rollback procedure

## Current candidate

- Release family: `Maintenance 8C — Local Sump Monitoring`
- Version: `4.3.45`
- Stable source backup: `Reef_Keeper_Maintenance_8B_v4.3.44_OBSERVER_MONITORING.zip`
- Candidate recovery package: `Reef_Keeper_Maintenance_8C_v4.3.45_LOCAL_SUMP_MONITORING.zip`

## Web rollback

1. Restore the verified v4.3.44 repository files or promote the last known-good v4.3.44 Vercel deployment.
2. Keep the existing private R2 and Observer environment variables unchanged.
3. Verify Home, Parameter Log, Settings, Ask AI, Apex, current Observer image, daily summary, and timelapses.

## Pi installation boundary

The active Publisher 2.3 service path must be read from systemd `ExecStart`; the verified installation uses `/opt/reefkeeper-observer/observer-publisher.py`. Before Publisher 2.4 is installed, stop the publisher timer, create a validated backup at that actual path, install the new script and calibration helper, and run one controlled service execution. Do not assume `/usr/local/bin/observer-publisher.py`.

## Pi rollback

1. Stop `reefkeeper-observer-publish.timer` and `reefkeeper-observer-publish.service`.
2. Restore the validated Publisher 2.3 backup to the systemd `ExecStart` script path.
3. Re-enable and start `reefkeeper-observer-publish.timer`.
4. Require a fresh successful publish reporting Publisher 2.3.

Camera capture, RTSP credentials, SSD mount, five-minute archive, R2 credentials, daily-summary endpoint, and timelapse builder are outside the Publisher 2.4 replacement and remain unchanged.

## Monitoring-only rollback

Water-level calibration is stored separately at `/etc/reefkeeper-observer/monitoring.json`. Disable water-level monitoring with the packaged calibration helper or move that file aside. Local scene baselines may be reset by moving `/mnt/reef-ssd/aquarium-observer/monitor-status.json`; the publisher will learn fresh baselines on subsequent captures.
