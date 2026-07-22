# Reef Keeper Maintenance 8A Test Report

## Candidate

- Version: `4.3.43`
- Baseline: verified `4.3.42 / Maintenance 7B`
- Test date: July 22, 2026

## Automated verification

The candidate must pass the complete `npm test` suite, including:

- JavaScript and inline-script syntax checks;
- global-function and DOM-reference integrity;
- all prior maintenance and mobile UI regressions;
- Cloudflare R2 request-signing, fixed-object-path, JSON-read, image-stream, and 404 behavior tests;
- Observer authentication, health, history, daily summary, alert, and timelapse tests;
- AI access-control and abuse guards;
- Apex data minimization;
- repository integrity and the Vercel 12-function limit.

## Activation verification

1. Confirm the Pi publisher timer is disabled before deployment.
2. Deploy the v4.3.43 application package.
3. Add all four R2 Production environment variables and redeploy.
4. Run `reefkeeper-observer-publish.service` once manually.
5. Confirm the service reports `PUBLISH_OK` without printing credentials.
6. Confirm Reef Keeper Observer displays a current image, current capture time, healthy storage, and history comparisons where available.
7. Re-enable the publisher timer and confirm the next scheduled publish succeeds.

## Result

`PASS WITH LIVE R2 ACTIVATION REQUIRED` — static, unit, integration-mock, repository, and regression tests pass; the private R2 credentials and live Cloudflare endpoint must be verified after deployment.
