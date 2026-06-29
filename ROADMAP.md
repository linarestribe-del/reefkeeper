# Reef Keeper Roadmap

## Current: v4.2.1 Telemetry Hardening

Goal: make live Apex telemetry reliable enough to support future Reef Brain, Timeline, and Equipment features.

Completed in this patch:

- Stable telemetry hub configuration is authoritative.
- Browser stale preview endpoints no longer override `telemetry-config.js`.
- Connector can reuse Apex sessions and retry login after 401.
- Telemetry endpoint is included in the release package.

## Next: v4.2.2 / v4.3.0

- Configure Vercel KV / Upstash on the stable hub.
- Add connector status/heartbeat card in the app.
- Add live equipment dashboard using Apex outlet states.
- Add automatic timeline events for telemetry snapshots and alarms.
- Add alert rules for heater, temperature, pH, ORP, leak, and outlet state problems.
