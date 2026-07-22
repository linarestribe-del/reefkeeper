# Reef Keeper Maintenance 5C Test Report

## Candidate

- Version: `4.3.34`
- Baseline: Maintenance 5B / `4.3.33`
- Scope: shared-key protection for four paid AI endpoints

## Automated coverage

The permanent `tests/ai-access-control.test.mjs` test verifies:

- missing keys return HTTP `401` on all four paid AI endpoints;
- incorrect keys return HTTP `401`;
- accepted keys proceed to ordinary request validation;
- `Authorization: Bearer` is supported for controlled verification;
- comma/newline key lists support safe rotation;
- no configured Vercel key preserves staged, non-breaking behavior;
- rejected access attempts never call OpenAI.

Release regression coverage verifies:

- version `4.3.34`;
- the Settings access-key UI exists;
- the device key is attached to paid AI requests;
- the key is not added to Reef Keeper backup exports;
- root/API endpoint copies remain synchronized;
- all four paid AI endpoints retain Maintenance 5B controls and add Maintenance 5C enforcement;
- the Vercel function count remains `12/12`.

## Completed candidate result

The complete repository test suite passed on the Maintenance 5C candidate using Node.js `22.16.0` and npm `10.9.2`.

```text
AI abuse guard tests passed.
AI access control tests passed.
Repository integrity checks passed.
Vercel function count passed: 12/12
```

## Required deployment verification

After setting `REEF_AI_ACCESS_KEY` in Vercel and redeploying:

1. An unauthenticated minimal POST to `/api/chat` must return `401` and `X-Reef-AI-Access: denied`.
2. A wrong key must return `401`.
3. The correct key must pass access control and return ordinary input validation without calling OpenAI.
4. Settings → AI → Test must report that Vercel accepted the device key.
5. Smoke-test Ask AI text, Ask AI photo, AI Vision, Generate AI Plan, Fill Details with AI, the AI monthly report, and Diagnostics → Ask AI endpoint.

## Expected security result

```text
Unauthenticated request: 401
Wrong-key request: 401
Correct-key validation request: 400 or 415
Access header with correct key: accepted
RESULT: PASS
```
