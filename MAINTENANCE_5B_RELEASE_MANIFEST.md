# Maintenance 5B release manifest

## Release

- Application version: `4.3.33`
- Maintenance phase: **Paid AI Request-Size and Burst Controls**
- Starting baseline: Maintenance 5A.1 / `4.3.32`
- Raspberry Pi update: **not required**
- Required Vercel environment-variable change: **none**
- Vercel function count: **12/12**

## Purpose

Maintenance 5B reduces accidental and straightforward direct abuse of the four public endpoints that can spend the server-side OpenAI account:

```text
/api/chat
/api/plan
/api/livestock
/api/photo-analysis
```

This phase deliberately avoids a login system, app UI change, new Vercel function, external rate-limit datastore, or Raspberry Pi change.

## Runtime controls

### Request-body ceilings

| Endpoint | Default maximum body | Default per-client burst allowance |
|---|---:|---:|
| `/api/chat` | 7,500,000 bytes | 30 requests / 10 minutes |
| `/api/plan` | 256,000 bytes | 8 requests / 10 minutes |
| `/api/livestock` | 16,384 bytes | 20 requests / 10 minutes |
| `/api/photo-analysis` | 6,400,000 bytes | 12 requests / 10 minutes |

Requests over the endpoint ceiling return HTTP `413` before an OpenAI request is made. Non-JSON requests return `415`.

### Chat input ceilings

The server retains only the newest supported messages and enforces:

```text
24 messages maximum
96,000 cumulative message characters maximum
12,000 characters maximum per individual message
```

The newest messages are preserved first so old history cannot crowd out the current request.

### Image validation

Both paid image paths accept only Base64 data URLs explicitly labeled as:

```text
JPEG / JPG
PNG
WebP
GIF
```

SVG and other arbitrary `data:image/*` payloads are rejected before OpenAI is called.

### Burst controls

Each endpoint tracks a client-address bucket and returns HTTP `429` plus `Retry-After` after the configured allowance. The limiter is dependency-free and stored in memory inside a warm serverless instance.

This is a **best-effort burst control**, not durable distributed rate limiting. New or parallel Vercel instances have separate memory, and callers are not authenticated in this phase. Maintenance 5B therefore reduces simple bursts and accidental duplicate requests but does not make the public AI endpoints private.

## Optional tuning variables

No variable is required. Defaults can be adjusted later with:

```text
REEF_AI_RATE_WINDOW_SECONDS
REEF_AI_CHAT_RATE_LIMIT
REEF_AI_PLAN_RATE_LIMIT
REEF_AI_LIVESTOCK_RATE_LIMIT
REEF_AI_PHOTO_RATE_LIMIT
REEF_AI_CHAT_MAX_BODY_BYTES
REEF_AI_PLAN_MAX_BODY_BYTES
REEF_AI_LIVESTOCK_MAX_BODY_BYTES
REEF_AI_PHOTO_MAX_BODY_BYTES
```

The code clamps overrides to safe ranges. Do not add these variables unless the defaults need adjustment after observing real use.

## Runtime files changed

```text
api/chat.js
api/plan.js
api/livestock.js
api/photo-analysis.js
chat.js
plan.js
livestock.js
photo-analysis.js
```

The root and `api/` compatibility copies remain synchronized.

The runtime-critical checksum file is also refreshed. Two stale entries for the root-level `apex-status.js` and `apex-sync.js` files—already deleted in Maintenance 4A—are removed; the live `api/` Apex files remain checksummed.

## Repository and validation files changed or added

```text
package.json
package-lock.json
README.md
CHANGELOG.md
tests/release-regression.test.cjs
tests/ai-abuse-guard.test.mjs
checksums/runtime-critical.sha256
checksums/maintenance-5B.sha256
MAINTENANCE_5B_RELEASE_MANIFEST.md
MAINTENANCE_5B_TEST_REPORT.md
```

## Not changed

- application UI, navigation, CSS, or browser request format;
- Apex sync/status behavior;
- Observer publishing, Blob storage, images, summaries, alerts, or time-lapses;
- Raspberry Pi services, connectors, schedules, credentials, or `.env` files;
- Vercel routes or function count;
- OpenAI model selection or output-token limits;
- dependencies.

## Rollback

Revert the Maintenance 5B repository commit or redeploy the Maintenance 5A.1 / `4.3.32` deployment. No Raspberry Pi rollback or data migration is required.
