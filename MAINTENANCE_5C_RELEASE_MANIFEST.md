# Reef Keeper Maintenance 5C Release Manifest

## Release

- Version: `4.3.34`
- Scope: durable shared-key access control for paid AI endpoints
- Starting baseline: Maintenance 5B / version `4.3.33`
- Vercel functions after change: `12/12`
- New dependency: none
- Raspberry Pi change: none
- Apex change: none
- Observer change: none

## Protected endpoints

Maintenance 5C protects these existing paid AI endpoints after a Vercel access key is configured:

- `/api/chat`
- `/api/plan`
- `/api/livestock`
- `/api/photo-analysis`

The browser sends the device-local key in the `X-Reef-AI-Access-Key` request header. The server also accepts `Authorization: Bearer <key>` for controlled command-line verification and key rotation.

## Staged activation

The code is intentionally non-breaking when first deployed:

1. If neither `REEF_AI_ACCESS_KEY` nor `REEF_AI_ACCESS_KEYS` exists in Vercel, the endpoints continue to work and return `X-Reef-AI-Access: not-configured`.
2. Once at least one key is configured, requests without a matching key return HTTP `401` with code `REEF_AI_ACCESS_REQUIRED` before OpenAI is called.
3. Accepted requests return `X-Reef-AI-Access: accepted` and continue through the Maintenance 5B request-size and burst guards.

This permits deployment and UI verification before enforcement is activated.

## Vercel environment variables

Preferred single-key setting:

```text
REEF_AI_ACCESS_KEY=<strong random key>
```

Optional rotation setting:

```text
REEF_AI_ACCESS_KEYS=<old key>,<new key>
```

`REEF_AI_ACCESS_KEYS` may contain up to eight comma- or newline-separated keys. Both variables may be present during a controlled rotation. Do not commit either value to GitHub, documentation, screenshots, chat, or backup files.

Recommended key generation on macOS:

```bash
openssl rand -hex 32
```

Use a unique key of at least 32 random bytes. Add it to the Vercel Production environment and any Preview/Development environments that must be protected, then redeploy.

## Device setup

On every phone, tablet, or browser used with Reef Keeper:

1. Open `More → Settings`.
2. Under `AI`, paste the same access key.
3. Tap `Save`.
4. Tap `Test`.
5. Confirm: `Connected. Vercel accepted this device key.`

The key is stored in browser `localStorage` under `reef_ai_access_key_v1`. It is masked in the Settings input and is not included in Reef Keeper backup exports. Clearing browser/site data removes it, so it must then be entered again.

## Security behavior

- Uses SHA-256 plus `timingSafeEqual` for fixed-length secret comparison.
- Rejects missing and incorrect keys before body-size/rate checks and before OpenAI requests.
- Sends the key only in a request header over the existing HTTPS origin.
- Returns `Cache-Control: no-store` and `Vary` headers.
- Does not put the key in URLs, query strings, application logs, exported backups, or repository files.
- Does not change Pi connector, Apex, Observer, telemetry, or public read endpoints.

## Limitations

This is a durable single-user/shared-secret access layer, not a multi-user account system. Anyone who obtains the key can use the protected endpoints until the key is rotated. A device with local browser access can also read its own stored key. Keep the key private, use a strong random value, and rotate it if a device or backup is compromised.

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
app.js
index.html
vision.js
css/app.css
app.css
```

## Test and release files changed or added

```text
package.json
package-lock.json
tests/ai-access-control.test.mjs
tests/ai-abuse-guard.test.mjs
tests/navigation-regression.test.mjs
tests/release-regression.test.cjs
README.md
CHANGELOG.md
MAINTENANCE_5C_RELEASE_MANIFEST.md
MAINTENANCE_5C_TEST_REPORT.md
checksums/runtime-critical.sha256
checksums/maintenance-5C.sha256
```

## Rollback

Rollback to the prior Vercel deployment or repository version `4.3.33`. Removing `REEF_AI_ACCESS_KEY` and `REEF_AI_ACCESS_KEYS` from Vercel also disables enforcement while retaining the Maintenance 5C code, but a full rollback is preferred if runtime behavior is suspect.
