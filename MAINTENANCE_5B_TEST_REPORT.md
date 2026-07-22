# Maintenance 5B test report

## Automated validation

The candidate was built from the user-supplied Maintenance 5A.1 repository ZIP and validated with the complete repository test suite.

The dedicated Maintenance 5B regression verifies:

- oversized chat requests return `413` without calling OpenAI;
- the measured parsed body size cannot be bypassed with a false small `Content-Length`;
- non-JSON requests return `415` before OpenAI;
- chat history is capped at 24 messages and 96,000 cumulative characters while retaining the newest message;
- normal guarded chat, plan, livestock, and supported-photo request paths still return usable responses;
- a configured two-request livestock allowance permits two calls and returns `429` with `Retry-After` on the third;
- a different client address is not blocked by another client's bucket;
- SVG photo data is rejected as unsupported before OpenAI.

## Full-suite result

- Full `npm test`: **passed**
- JavaScript syntax checks: **passed**
- Python syntax checks: **passed**
- Repository-integrity check: **passed**
- Vercel function count: **passed at 12/12**
- ZIP integrity: **passed**


## Known limitation

The burst limiter is held in memory within each warm Vercel function instance. It is useful against accidental retries and simple bursts but is not durable across cold starts, deployments, regions, or parallel instances. Maintenance 5B is therefore an intermediate protection layer. Caller authentication or durable platform-level rate limiting remains a later security phase.

## Post-deployment smoke checks

1. Ask AI sends a normal text request.
2. Ask AI analyzes one photo.
3. AI Vision structured photo analysis completes.
4. Generate AI Plan completes.
5. Fill Details with AI completes for one livestock entry.
6. Home Apex readings and Aquarium Observer remain unchanged.
