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

## Build 2J daily visual summary
Publisher version 2.2 selects one representative capture near noon local time for the current day and one for the prior day. After a 20-minute settling delay, it sends only those two frames to the authenticated `/api/observer-daily-summary` endpoint. The server generates and stores one evidence-limited visual report per day. The full five-minute archive remains local.


## Maintenance 8B Observer publisher 2.3

Publisher 2.3 keeps the successful daily visual comparison at one report per daily frame and bounds failures to three attempts by default, separated by 180 minutes. Optional private Pi configuration keys are:

```json
{
  "daily_summary_retry_minutes": 180,
  "daily_summary_max_attempts": 3
}
```

The defaults require no configuration edit. The publisher also includes daily-monitoring state in the existing non-secret health payload. Deterministic operational alerts are created server-side from that health metadata; no per-frame image is sent to OpenAI.
