# Reef Keeper Maintenance 8B Release Manifest

## Release

- Version: `4.3.44`
- Baseline: verified `4.3.43 / Maintenance 8A` with live Cloudflare R2 publishing
- Scope: daily-summary cost safeguards and deterministic Observer operational alerts

## Intentional runtime changes

- Updates the Raspberry Pi Observer publisher to version `2.3`.
- Limits automatic daily visual-summary retries to three attempts per daily frame, separated by a default three-hour interval.
- Resets the retry budget automatically when the next day’s representative frame is selected.
- Publishes daily-monitoring state, attempt count, next retry, and last generation time as non-secret health metadata.
- Adds deterministic operational alerts for camera capture, publisher freshness, SSD state, Pi power, archive, and daily-summary failures.
- Operational alerts are generated from health metadata and do not send frames to OpenAI.
- Keeps the existing evidence-limited visual comparison at a maximum of one successful report per day.
- Serves non-secret connector source through `/connector/*` so the installed Pi script can be updated from the stable app origin.
- Adds a Daily monitoring row to Observer Health and combines system and visual alerts in the existing alert card.

## Explicitly unchanged

- Tapo camera credentials and RTSP configuration;
- five-minute local capture archive and 1 TB SSD storage;
- private Cloudflare R2 credentials and object paths;
- Ask AI access controls, Apex, navigation, storage schemas outside Observer, and Vercel routes;
- Vercel function count, which remains 12.

## Pi activation

After the web deployment is verified, discover the active publisher path from the systemd service `ExecStart` value before replacing the script. The verified installation uses `/opt/reefkeeper-observer/observer-publisher.py`; do not assume `/usr/local/bin/observer-publisher.py`. Preserve `/etc/reefkeeper-observer/publisher.json`, then run one manual publisher service test before restarting the timer.

## Rollback

Restore `4.3.43 / Maintenance 8A` in GitHub and restore the prior publisher script if the Pi-side 2.3 test fails. Local camera captures and SSD archives are not modified by either rollback.
