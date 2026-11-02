# Temporary real Meta inference evidence capture — 2026-11-03

The DirectHome photo AI API requires real Supabase login, and automation must not forge identity or bypass session validation. The ordinary owner flow remains unchanged.

This separate internal-only capture endpoint allows the project operator to validate exactly one **generated synthetic photo** with real provider calls, for hackathon evidence. It is intentionally short-lived and must be **removed from main immediately after evidence collection**.

## Protection
- POST only, not linked in product UI. In production only, when `DIRECTHOME_META_EVIDENCE_ENABLED=true`.
- Server-only random token header `x-directhome-demo-token` compared in constant time, >=32 bytes. No token committed or printed.
- `DIRECTHOME_META_EVIDENCE_SHA256` pins the exact JPEG bytes to prevent uploading private or unrelated images.
- `consent:true` required separately for each operation. No PII, files or provider responses persisted by the endpoint.
- Atomic PostgreSQL one-shot attempt marker per operation. Deny on second attempt, concurrent retries or DB error.
- Existing global photo AI budget decremented too. Failed provider calls may still consume an attempt.
- Model credentials stay in Vercel server environment, never in repo, browser, logs or GitHub Actions.
- Returned results must be labeled `Actual Meta model output` with model and source SHA. No success claims until actually inspected.

## Recording
A trusted operator sends the **approved generated JPEG** to `POST /api/internal/meta-evidence` with the protected header. The response for Vision is a sanitized allowlisted JSON; the Image response is a validated WebP data URI. Save one response per operation to private evidence artifacts. The final video must distinguish these captured model results from the rest of the Mock story.

## Required teardown
1. Remove `web/app/api/internal/meta-evidence/route.ts`, merge and deploy.
2. Remove/rotate `DIRECTHOME_META_EVIDENCE_ENABLED`, `DIRECTHOME_META_EVIDENCE_TOKEN`, and `DIRECTHOME_META_EVIDENCE_SHA256` environment variables.
3. Confirm the removed URL returns 404 on production.
4. Preserve only the synthetic fixture, result evidence and edited video in GitHub Release assets (not auth tokens or original personal photos).
