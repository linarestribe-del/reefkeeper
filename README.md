# Reef Keeper Apex Connector v4.2.1

This connector runs on your home Mac. It reads your local Neptune Apex `/rest/status` endpoint and pushes a normalized snapshot to the stable Reef Keeper telemetry hub.

## Recommended one-time test

From the connector folder:

```bash
export REEF_KEEPER_URL="https://reefkeeper-l4isz0ta2-jorge-s-projects6.vercel.app"
export APEX_BASE_URL="http://apex.local"
export APEX_USERNAME="your-apex-username"
export APEX_PASSWORD="your-apex-password"
node apex-connector.mjs --once
```

If your Apex firmware does not accept automatic login yet, use a temporary cookie:

```bash
export APEX_COOKIE="connect.sid=YOUR_CURRENT_COOKIE"
node apex-connector.mjs --once
```

Good output looks like:

```text
pushed Apex telemetry: temp=76.6 pH=8.45 ORP=334 outlets=30 alarms=0 durable=true auth=saved-cookie
```

## Stable hub rule

Use the stable hub URL, not the temporary preview branch URL. The app previews read from the stable hub through `telemetry-config.js`.

You can also target the exact endpoint:

```bash
export REEF_KEEPER_TELEMETRY_ENDPOINT="https://reefkeeper-l4isz0ta2-jorge-s-projects6.vercel.app/api/telemetry"
```

## Persistent cloud storage

For reliable telemetry, configure Vercel KV / Upstash variables on the stable hub deployment:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Optional security variables:

```text
REEF_TELEMETRY_WRITE_TOKEN
REEF_TELEMETRY_READ_TOKEN
```

If you set `REEF_TELEMETRY_WRITE_TOKEN`, also set this before running the connector:

```bash
export REEF_KEEPER_TOKEN="same-write-token"
```

## Continuous mode

Without `--once`, the connector keeps running and pushes every 60 seconds by default:

```bash
export APEX_POLL_SECONDS="60"
node apex-connector.mjs
```

## Notes

- v4.2.1 reuses and saves Apex session cookies at `~/.reef-keeper/apex-session.json`.
- It retries Apex login after a 401 when username/password are provided.
- If automatic login fails, use `APEX_COOKIE` until the next connector login refinement.
- Use `--verbose` for login diagnostics.

## Aquarium Observer publishing bridge (Build 2F)

The app accepts the Raspberry Pi's current selected JPEG at:

```text
POST /api/observer-publish
```

Required Vercel configuration:

- Connect a **Private Vercel Blob** store to the project.
- Set `REEF_OBSERVER_WRITE_TOKEN` in Production, Preview, and Development as appropriate.

The Pi publisher is included at:

```text
connector/observer-publisher.py
```

It publishes only the current JPEG and sanitized status. The full dated image archive remains on the Pi at `/mnt/reef-ssd/aquarium-observer/captures/`. Camera credentials, RTSP URLs, local addresses, and local file paths are not sent to Vercel.
