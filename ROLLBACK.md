# Reef Keeper rollback procedure

## Current candidate

- Release family: `Maintenance 8D — Dual-Camera Observer`
- Version: `4.3.46`
- Stable source backup: `Reef_Keeper_Maintenance_8C_v4.3.45_LOCAL_SUMP_MONITORING.zip`
- Candidate recovery package: `Reef_Keeper_Maintenance_8D_v4.3.46_DUAL_CAMERA_OBSERVER.zip`

## Web rollback

1. Restore the verified v4.3.45 repository files or promote the last known-good v4.3.45 Vercel deployment.
2. Keep private R2 and Observer environment variables unchanged.
3. Verify Home, Parameter Log, Settings, Ask AI, Apex, and the overview Observer feed.
4. Publisher 2.5 may continue publishing during a brief web rollback, but restore Publisher 2.4 if the older status contract is required.

## Pi publisher boundary

The active publisher path must be read from systemd `ExecStart`; the verified installation uses `/opt/reefkeeper-observer/observer-publisher.py`. The packaged 2.5 installer stops only the publisher timer, creates validated Publisher 2.4 and calibration-helper backups, installs the verified files, performs a controlled dual-camera publish, and rolls back automatically if either camera does not publish successfully.

## Pi publisher rollback

1. Stop `reefkeeper-observer-publish.timer` and `reefkeeper-observer-publish.service`.
2. Restore the validated Publisher 2.4 backup to the systemd `ExecStart` script path.
3. Restore the matching calibration-helper backup.
4. Re-enable and start `reefkeeper-observer-publish.timer`.
5. Require a fresh successful overview publish reporting Publisher 2.4.

## Local capture boundary

The overview and return-camera capture services, RTSP credentials, SSD paths, and timers are independent of the web overlay and Publisher 2.5 package. A Publisher 2.4 rollback ignores the return path but does not require disabling or deleting it.

## Monitoring-only rollback

Return water-level calibration is stored at `/etc/reefkeeper-observer/return-monitoring.json`. Disable it with the packaged helper or move that file aside. Return scene baselines may be reset by moving `/mnt/reef-ssd/aquarium-observer/return-chamber/monitor-status.json`; overview baselines remain separate.
