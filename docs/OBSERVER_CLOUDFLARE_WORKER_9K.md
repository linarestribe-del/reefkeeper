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
