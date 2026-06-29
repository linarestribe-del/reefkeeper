# Reef Keeper Apex Connector

Runs at home, reads the local Apex `/rest/status` endpoint, and pushes normalized telemetry to Reef Keeper Cloud.

## Vercel setup

Create Vercel KV storage for the project, then add these environment variables:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `REEF_TELEMETRY_WRITE_TOKEN` — make a long random value
- `REEF_TELEMETRY_READ_TOKEN` — optional; only needed if you want the app to require a read token

Redeploy after adding environment variables.

## Run once from a Mac

```bash
APEX_BASE_URL="http://apex.local" \
APEX_USERNAME="your_apex_username" \
APEX_PASSWORD="your_apex_password" \
REEF_KEEPER_URL="https://your-reef-keeper.vercel.app" \
REEF_KEEPER_TOKEN="same_value_as_REEF_TELEMETRY_WRITE_TOKEN" \
node connector/apex-connector.mjs --once
```

## Run continuously

```bash
APEX_BASE_URL="http://apex.local" \
APEX_USERNAME="your_apex_username" \
APEX_PASSWORD="your_apex_password" \
REEF_KEEPER_URL="https://your-reef-keeper.vercel.app" \
REEF_KEEPER_TOKEN="same_value_as_REEF_TELEMETRY_WRITE_TOKEN" \
APEX_POLL_SECONDS=60 \
node connector/apex-connector.mjs
```

## If Basic auth does not work

Copy the `connect.sid=...` cookie from a working Apex browser session and run:

```bash
APEX_BASE_URL="http://apex.local" \
APEX_COOKIE="connect.sid=YOUR_COOKIE_VALUE" \
REEF_KEEPER_URL="https://your-reef-keeper.vercel.app" \
REEF_KEEPER_TOKEN="same_value_as_REEF_TELEMETRY_WRITE_TOKEN" \
node connector/apex-connector.mjs --once
```

## Test in Reef Keeper

Go to **More → Apex Integration → Native Apex / Telemetry Test** and tap **Fetch Cloud**.


## v4.2.0 Stable Telemetry Hub

Use one permanent telemetry endpoint for the connector, not a temporary branch preview URL.

Recommended:

```bash
export REEF_KEEPER_TELEMETRY_ENDPOINT="https://YOUR-STABLE-REEFKEEPER-URL.vercel.app/api/telemetry"
```

Alternative:

```bash
export REEF_KEEPER_URL="https://YOUR-STABLE-REEFKEEPER-URL.vercel.app"
```

Then run:

```bash
node apex-connector.mjs --once
```

All preview branches should read from the same endpoint configured in `telemetry-config.js`.
