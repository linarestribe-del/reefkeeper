# Maintenance 9C.3 Release Manifest

- Application version: `4.3.51`
- Observer publisher: `2.7.3`
- Scope: unique-capture confirmation streaks for local camera monitoring

## Corrected behavior

Publisher 2.7.2 advanced confirmation streaks every time the publisher evaluated a frame. Multiple publisher runs against one unchanged return-camera image could therefore make a single five-minute feed-mode water rise look like several consecutive abnormal captures.

Publisher 2.7.3 stores the capture timestamp as the monitor's capture key. Water-level, obstruction, scene-change, and movement streaks advance only when that key changes. Reprocessing the same image preserves the current streak without incrementing it. Visual baseline learning is also limited to one update per unique capture.

## Expected feed-cycle behavior

With return-camera captures approximately every five minutes and `alert_streak` set to 3:

- Normal operation: healthy, streak 0
- One feed-mode capture: pending, streak 1
- Repeated publisher runs on that same capture: pending, streak 1
- First normal capture after feed mode: healthy, streak 0

## Deployment order

1. Upload the changed files to GitHub.
2. Wait for the Vercel deployment to report Ready.
3. Install Publisher 2.7.3 on the Raspberry Pi with the included verified installer.
4. Force a return capture and publish.
5. Repeat the feed-mode test and confirm a single feed capture does not advance beyond streak 1.
