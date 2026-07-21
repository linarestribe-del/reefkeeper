# Reef Keeper Maintenance 4A.1 Release Manifest

## Purpose
Restore repository safeguard files that were missing from the current GitHub repository and remove generated Python cache artifacts.

## Added or restored
- `.gitignore`
- `.nvmrc`
- `.npmrc`
- `.github/workflows/ci.yml`

These files are exact copies from the previously verified Maintenance 1.1 safeguard release.

## Removed
- `connector/__pycache__/`
- Any compiled `*.pyc` or `*.pyo` cache files

## Intentionally unchanged
- `index.html`
- `app.js`
- `observer.js`
- All CSS
- All files under `api/`
- All files under `ai/`
- All active connector source files
- `vercel.json`
- `package.json`
- `package-lock.json`
- All Raspberry Pi services and configuration

## Apex recovery status
The active Apex functions are present:
- `api/apex-status.js`
- `api/apex-sync.js`

The obsolete root-level duplicate copies remain absent.

## Vercel status
The repository contains 12 API functions, matching the Hobby-plan limit.
