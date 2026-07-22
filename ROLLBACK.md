# Reef Keeper rollback procedure

## Current candidate

- Release family: `Maintenance 8A — Observer R2 Migration`
- Version: `4.3.43`
- Stable source backup: `Reef_Keeper_Maintenance_7B_v4.3.42_IPHONE_STATUS_CANVAS.zip`
- Candidate recovery package: `Reef_Keeper_Maintenance_8A_v4.3.43_R2_OBSERVER_MIGRATION.zip`

## Before activation

Keep `reefkeeper-observer-publish.timer` disabled until the R2 Production variables are configured and a manual publisher run succeeds.

## Application rollback

1. Restore the verified v4.3.42 repository files or promote the last known-good v4.3.42 Vercel deployment.
2. Do not remove the R2 bucket or credentials during an application rollback; they contain only the candidate Observer objects and can remain private.
3. Leave the Pi publisher disabled because v4.3.42 writes to Vercel Blob, whose access is currently paused.
4. Verify Home, Parameter Log, Settings, Ask AI, and Apex.

The non-Observer application remains usable on v4.3.42 even while remote Observer storage is unavailable.

## Successful activation recovery point

After v4.3.43 completes a manual publish and device verification, save its full ZIP as the new recovery baseline. A later rollback to v4.3.43 requires the four `REEF_OBSERVER_R2_*` Production environment variables to remain present.

## Raspberry Pi boundary

Maintenance 8A does not modify capture, archive, camera, or timelapse files on the Pi. It only re-enables the existing publisher timer after server-side R2 activation is proven.
