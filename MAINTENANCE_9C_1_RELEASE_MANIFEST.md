# Maintenance 9C.1 Release Manifest

- Application version remains `4.3.49`.
- Raspberry Pi publisher version: `2.7.1`.
- Corrects a transient verification failure caused when the publisher reads `latest.jpg` while a camera capture is replacing it.
- Publisher now prefers the immutable dated capture path recorded in each camera's `status.json`.
- Installer refreshes the return-camera capture before verification, retries once, and preserves automatic rollback.

## Deployment

1. Upload the changed files to the existing v4.3.49 repository.
2. Wait for Vercel to report Ready.
3. Run `connector/install-observer-publisher-2.7.1.sh` from the deployed app URL.
