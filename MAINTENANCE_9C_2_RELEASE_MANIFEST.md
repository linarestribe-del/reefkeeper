# Maintenance 9C.2 Release Manifest

- Application version: `4.3.50`
- Observer publisher: `2.7.2`
- Scope: return-camera local-monitor state-path correction

## Corrected behavior

Publisher 2.7.1 evaluated the return camera with the correct private configuration but saved the result to the overview camera's fixed status path. The return camera's own `monitor-status.json` therefore remained stale and continued reporting that water-level monitoring was not calibrated.

Publisher 2.7.2 writes monitor state to the `state_path` supplied by the caller, keeping overview and return monitoring independent.

## Deployment order

1. Upload the changed files to GitHub.
2. Wait for the Vercel deployment to report Ready.
3. Install Publisher 2.7.2 on the Raspberry Pi with the included verified installer.
4. Force one return capture and publisher run.
5. Confirm `/mnt/reef-ssd/aquarium-observer/return-chamber/monitor-status.json` reports `configured: true`.
