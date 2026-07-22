# Reef Keeper rollback procedure

This procedure restores the last known-good application without changing the Raspberry Pi, camera, SSD, Vercel Blob store, or environment variables.

## Known-good baseline

- Application version: `4.3.40`
- Release family: `Maintenance 6F — Stable Post-Cleanup Checkpoint`
- Saved source backup: `Reef_Keeper_Maintenance_6F_v4.3.40_STABLE_BASELINE.zip`
- Previous verified rollback: `4.3.39 / Maintenance 6E`
- Maintenance 6F changes release metadata, documentation, and automated safeguards only; application workflows, storage, APIs, and Pi services are unchanged.

## Fastest rollback: Vercel deployment

1. Open the Reef Keeper project in Vercel.
2. Open **Deployments**.
3. Select the last deployment that was confirmed working before the maintenance change.
4. Use **Promote to Production** or **Redeploy**, depending on the options shown.
5. Do not delete or recreate environment variables, the private Blob store, or project domains.
6. Reload Reef Keeper and run the smoke-test checklist below.

## Source rollback: GitHub/repository

1. Preserve the failing repository state as a separate ZIP before replacing anything.
2. Restore the contents of the saved known-good repository ZIP to the repository root.
3. Remove files that are not present in the known-good ZIP; uploading replacement files alone does not delete obsolete files.
4. Commit the restoration as a dedicated rollback commit.
5. Wait for Vercel to report **Ready**.
6. Run the smoke-test checklist.

## Raspberry Pi rule

Do not change the Pi during an application-only rollback unless the failed release explicitly installed a Pi update. Maintenance 6F does not require or modify the Pi.

## Smoke-test checklist

- Home page opens.
- Bottom navigation works.
- Parameter Log opens.
- Ask AI text request works.
- One-photo analysis works.
- Multi-photo comparison works.
- Aquarium Observer loads the latest image.
- Observer historical comparison opens.
- Observer Health, Daily Summary, and Alerts load.
- Apex telemetry appears.
- No new Vercel function-limit or runtime errors appear.

## Stop condition

If any core workflow fails, stop the rollout. Do not patch multiple subsystems simultaneously. Restore the known-good deployment and investigate the candidate separately.
