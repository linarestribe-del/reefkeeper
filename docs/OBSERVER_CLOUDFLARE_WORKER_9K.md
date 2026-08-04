# Maintenance 9K — Observer Cloudflare Worker Backend

Maintenance 9K moves the expensive Observer upload path away from Vercel. The main Reef Keeper app can remain on Vercel, but the Raspberry Pi publishes camera images, return-camera images, status, and timelapses directly to a Cloudflare Worker backed by R2.

## Why this exists

Vercel Hobby limits were exceeded by frequent Observer media publishing. Maintenance 9H slowed Vercel publishing. Maintenance 9J prepared the app for direct media URLs. Maintenance 9K adds the Cloudflare Worker backend that can receive those uploads without sending image/video bytes through Vercel Functions.

## Cloudflare resources

Create:

1. R2 bucket, recommended name: `reefkeeper-observer`.
2. Worker, recommended name: `reefkeeper-observer`.
3. R2 bucket binding on the Worker:
   - binding name: `OBSERVER_BUCKET`
   - bucket: `reefkeeper-observer`
4. Worker secret:
   - `REEF_OBSERVER_WRITE_TOKEN`
   - value: same token currently used by the Pi publisher.

Cloudflare Workers access R2 through an R2 bucket binding on `env`; Worker secrets should be stored with Cloudflare secret management rather than committed into source.

## Worker routes

The Worker accepts both root and `/api` forms so the existing Pi endpoint conventions continue to work:

- `POST /api/observer-publish`
- `POST /api/observer-publish?camera=return`
- `POST /api/observer-publish?resource=timelapse`
- `POST /api/observer-publish?resource=timelapse&camera=return`
- `GET /api/observer-status`
- `GET /api/observer-status?resource=timelapses`
- `GET /api/observer-image`
- `GET /api/observer-image?camera=return&slot=latest`
- `GET /api/observer-image?media=timelapse&slot=week`
- `GET /aquarium-observer/latest.jpg`
- `GET /aquarium-observer/return-chamber/latest.jpg`

## Important limitation

The Worker intentionally does not run the OpenAI daily visual summary. That keeps the cost-saving path simple and avoids sending daily comparison images through Vercel. Daily AI summaries can be restored later with a separate design.

## Vercel environment variable after Worker deployment

After the Worker is deployed and tested, set this Vercel variable so images and videos are read directly from the Worker/R2 path:

```text
REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
```

Do not put credentials in this value.

## Pi endpoint migration

After the Worker is deployed, use:

```bash
bash /tmp/configure-observer-worker-endpoint.sh https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
```

That sets the Pi publisher endpoint to:

```text
https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/observer-publish
```

Keep cloud publishing paused until the Worker health check and endpoint configuration pass.


## Maintenance 9K.1 media-routing note

9K.1 keeps the same Cloudflare Worker/R2 architecture, but fixes the first live cutover issue found during deployment:

- Worker `/api/observer-status` now returns direct public media URLs for current images, history slots, return-chamber images, and timelapses.
- Vercel `/api/observer-status` now re-normalizes the stored R2 status before returning it, so `REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL` is applied to stored records that still contain legacy `/api/observer-image` paths.
- Worker `/api/observer-image` accepts `HEAD` as well as `GET` for quick checks.
- Worker daily-summary POST returns `ok: true` while daily AI summaries remain storage-only/paused on the Worker backend, preventing the Pi publisher from marking a successful Cloudflare response as a retryable error.


## Maintenance 9K.2 notes

Maintenance 9K.2 keeps the 9K/9K.1 Cloudflare Worker and R2 design, and adds Pi Publisher 2.8.2. The only publisher behavior change is daily-summary compatibility with the storage-only Cloudflare Worker backend. The publisher now treats the Worker daily-summary acknowledgement as a reused/storage-only success instead of repeatedly recording `Publish returned HTTP 200` and scheduling retries.

Regular overview and return-camera publishing remain unchanged. The publisher timer should remain on its 15-minute schedule. The timelapse timer should remain off until the dedicated Cloudflare timelapse verification step is run.
