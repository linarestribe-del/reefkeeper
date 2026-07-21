# Maintenance 2 release manifest

## Purpose

Maintenance 2 removes only two obsolete pre-release backup scripts from the confirmed working Reef Keeper `4.3.31 / Build 2L.1` repository.

## Files removed

- `app.before_visual_reminder.js`
- `vision.before_visual_reminder.js`

These files were historical snapshots. They are not referenced by `index.html`, imported by any active JavaScript module, used by a Vercel route, included by `package.json`, or required by the automated test suite.

## Runtime behavior

Maintenance 2 does not alter any active runtime file. In particular, it does not modify:

- `index.html`
- `app.js`
- `observer.js`
- `app.css` or `css/app.css`
- `vercel.json`
- any file under `api/`, `ai/`, `lib/`, or `connector/`
- Raspberry Pi services or configuration
- Vercel environment variables or Blob configuration

## Deployment note

Uploading a ZIP through the GitHub website does not delete files that are absent from the ZIP. The two files listed above must therefore be deleted directly from the repository. The ZIP is a clean post-deletion repository snapshot and rollback reference.
