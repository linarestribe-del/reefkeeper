# Reef Keeper Maintenance 7B Release Manifest

## Release

- Version: `4.3.42`
- Baseline: verified `4.3.41 / Maintenance 7A`
- Scope: isolated correction for the remaining solid iPhone status-area band

## Intentional runtime changes

- Paints the reef background image on the root `html/body` canvas.
- Makes `.ocean-bg` transparent so the artwork remains one continuous background rather than restarting below the status area.
- Adds `theme-color: #2f83b3` as a compatible solid fallback when iOS/browser chrome does not expose the root image.
- Updates CSS/JS cache keys and the Settings version label.

## Explicitly unchanged

- Maintenance 7A header scrolling and Ask AI answer positioning;
- bottom navigation and page scrolling;
- browser storage keys, schemas, migrations, backups, and records;
- AI prompts, access control, request guards, and API behavior;
- Apex, Aquarium Observer, Raspberry Pi services, Vercel routes, dependencies, and environment variables.

## Rollback

Restore or promote the verified `4.3.41 / Maintenance 7A` deployment. No Raspberry Pi or Vercel environment-variable change is required.
