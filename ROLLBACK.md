# Reef Keeper rollback procedure

## Current candidate

- Release family: `Maintenance 8B — Observer Monitoring Safeguards`
- Version: `4.3.44`
- Stable source backup: `Reef_Keeper_Maintenance_8A_v4.3.43_R2_OBSERVER_MIGRATION.zip`
- Candidate recovery package: `Reef_Keeper_Maintenance_8B_v4.3.44_OBSERVER_MONITORING.zip`

## Before Pi activation

The v4.3.44 web build can be deployed while publisher 2.2 continues running. Before replacing the Pi script, stop the publisher timer, back up `/usr/local/bin/observer-publisher.py`, syntax-check publisher 2.3, and perform one manual service run.

## Application rollback

1. Restore the verified v4.3.43 repository files or promote the last known-good v4.3.43 Vercel deployment.
2. Keep the four private `REEF_OBSERVER_R2_*` Production variables in place.
3. Verify Home, Parameter Log, Settings, Ask AI, Apex, and the current Observer image.
4. If the problem is isolated to publisher 2.3, restore only the Pi script backup instead of rolling back the web app.

## Successful activation recovery point

After v4.3.44 and publisher 2.3 complete live verification, save the full v4.3.44 ZIP and the backed-up publisher 2.2 script as the new recovery set.

## Raspberry Pi boundary

Maintenance 8B changes only the Observer publisher script. Camera credentials, RTSP configuration, capture service, SSD mount, local archive, and timelapse builder remain unchanged.


## Maintenance 8B Pi rollback

If publisher 2.3 fails its manual service test, restore the previous `/usr/local/bin/observer-publisher.py` and restart `reefkeeper-observer-publish.timer`. The local capture service and archive remain independent.
