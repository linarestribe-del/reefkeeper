# Maintenance 9K Release Manifest — Observer Cloudflare Worker Backend

Version: Reef Keeper v4.3.64  
Scope: Cost architecture continuation after Vercel Hobby Fast Origin Transfer and Blob operation limits were exceeded.

## Purpose

Maintenance 9K adds a direct Cloudflare Worker + R2 backend for Aquarium Observer media publishing. The Raspberry Pi can publish large overview, return-chamber, history, and timelapse payloads to Cloudflare instead of routing those bytes through Vercel Functions.

## Changed behavior

- Adds `cloudflare/observer-worker.js`, a dependency-free Worker that supports the existing Observer publisher routes.
- Adds `cloudflare/wrangler.toml.example` for the required R2 bucket binding.
- Adds `connector/configure-observer-worker-endpoint.sh` to point the Pi publisher at a deployed Worker endpoint.
- Adds documentation in `docs/OBSERVER_CLOUDFLARE_WORKER_9K.md`.
- Keeps Vercel functions at 12/12.
- Keeps the existing Vercel API fallback paths intact.

## Important limitations

- 9K does not create the Cloudflare account, bucket, Worker, binding, custom domain, or secrets for the user.
- 9K does not resume Pi cloud publishing automatically.
- The Worker deliberately does not run OpenAI daily visual summaries. This avoids sending daily image pairs back through Vercel during the cost-reduction phase.

## Required Cloudflare configuration

- R2 bucket, recommended name: `reefkeeper-observer`
- Worker binding: `OBSERVER_BUCKET`
- Worker secret: `REEF_OBSERVER_WRITE_TOKEN`
- Optional Vercel media base: `REEF_OBSERVER_PUBLIC_MEDIA_BASE_URL=https://<worker-host>`

## Rollback

Do not run the Pi endpoint script, or restore `/etc/reefkeeper-observer/publisher.json` from the script-created backup. The Vercel app continues to support the previous R2-backed API paths.
