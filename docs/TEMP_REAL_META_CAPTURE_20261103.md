# Temporary real Meta inference evidence capture — 2026-11-03

> **RETIRED (2026-11-03 KST):** This one-shot endpoint was used exactly once for each of three Meta operations, then deleted. Its Vercel sandbox has been stopped. This document is an archival audit of the retired mechanism, NOT an available product API. See [the verified public release](https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-real-meta-demo-20261103) and [the evidence report](REAL_META_VERIFICATION_20261103.md).\n\n
The DirectHome photo AI API requires real Supabase login, and automation must not forge identity or bypass session validation. The ordinary owner flow remains unchanged.

This separate internal-only capture endpoint allows the project operator to validate exactly one **Meta-generated synthetic photo** with real provider calls, for hackathon evidence. It is intentionally short-lived and must be **removed from main immediately after evidence collection**.

## Protection
- POST only, not linked in product UI. In production only, when `DIRECTHOME_META_EVIDENCE_ENABLED=true`.
- Server-only random token header `x-directhome-demo-token` compared in constant time, >=32 bytes. No token committed or printed.
- A one-shot Meta Muse Image generation call creates the only allowed test JPEG. Its SHA-256 is signed with HMAC using the operator token; Vision and edit reject unsigned or changed images.
- `consent:true` required separately for each operation. No PII, files or provider responses persisted by the endpoint.
- Atomic PostgreSQL one-shot attempt marker for each of the three operations (generation, vision, edit). Deny on second attempt, concurrent retries or DB error.
- Existing global photo AI budget decremented too. Failed provider calls may still consume an attempt.
- Model credentials stay in Vercel server environment, never in repo, browser, logs or GitHub Actions.
- Returned results must be labeled `Actual Meta model output` with model and source SHA. No success claims until actually inspected.

## Recording
A trusted operator first POSTs `{feature:'generate',consent:true}` with the protected header. The returned JPEG + HMAC proof are then used for exactly one Vision and one Muse Image edit request. All three calls are billed to the configured Meta account. No login token is forged and the public consumer photo APIs remain unchanged. The response for Vision is a sanitized allowlisted JSON; the Image response is a validated WebP data URI. Save one response per operation to private evidence artifacts. The final video must distinguish these captured model results from the rest of the Mock story.

## Required teardown
1. Remove `web/app/api/internal/meta-evidence/route.ts`, merge and deploy.
2. Remove/rotate `DIRECTHOME_META_EVIDENCE_ENABLED`, `DIRECTHOME_META_EVIDENCE_TOKEN`, and `DIRECTHOME_META_EVIDENCE_SHA256` environment variables.
3. Confirm the removed URL returns 404 on production.
4. Preserve only the synthetic fixture, result evidence and edited video in GitHub Release assets (not auth tokens or original personal photos).
