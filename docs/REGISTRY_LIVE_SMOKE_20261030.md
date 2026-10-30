# DirectHome Registry AI — Live Meta Smoke Verification
**Date:** 2026-10-30 (KST)  
**Status:** Preview **PASS** / Production **PASS**, one real Meta request per environment

## Objective
Verify the seller-side **PDF → AI listing draft** feature against the actual Meta Muse Spark 1.3 API, rather than only against deterministic Mock fixtures. The test uses **one fully fictional education-only Korean registry PDF** (`normal.pdf`); no personal records or original PDF are committed.

**Input:** publicly available education sample; 908,854 bytes, SHA-256 `2ddff3f07aa134c04456685db796ffb8029e007159eabc3c07c6c0fad1e87b50`. The server verified SHA-256 before invoking Meta.  
**Model:** `muse-spark-1.3`; **actual API endpoint:** `https://api.meta.ai/v1/chat/completions`.  
**Path under test:** the same `buildRegistryMetaRequest`, `parseChatResponse`, and `validateRegistryDraft` components used by `/api/listings/import-registry`, invoked through a temporary token-guarded server-side QA route.

## Results

| Check | Expected | Preview live | Production live |
| --- | --- | --- | --- |
| Provider | Meta, NOT Mock | Meta | Meta |
| API result | HTTP 200 | **PASS** | **PASS** |
| Address | 서울특별시 가상구 샘플로 10길 101 | **match** | **match** |
| Building name | 당당아파트 | **match** | **match** |
| Building dong | 105 | **match** | **match** |
| Unit floor | 5 | **match** | **match** |
| Unit number | 501 | **match** | **match** |
| Exclusive unit area | **59.84㎡** | **match** | **match** |
| Claim of confirmed ownership | Must be absent | absent | absent |
| New asking sale price | Must NOT be generated | absent | absent |

The model did **not** substitute building's whole-floor area (425.30㎡), land area (5,432.10㎡), or whole-building height (12 stories) for this unit's records.

**Deployment evidence:** Preview branch `chatgpt/registry-pdf-ai-draft-20261030` (smoke commit `991cde969efcb4f465ef8b27e0a320f37196de01`); Production `main@2ead320b42ff18b5286ac7f6efff171dc38ce0b2`. Vercel confirmed both deployments `READY` and public capability API `{provider:"meta", enabled:true, sampleOnly:false}`.

## Safety and limits
- **Total real paid inferences made during this test: 2** (one Preview + one Production). No unbounded retries. Exact token cost was not retrieved and should **not** be claimed as measured.
- The internal smoke route required a separate high-entropy HTTP header and checked the exact synthetic PDF hash; it did not permit arbitrary document uploads or bypass normal customer authentication. The temporary routes were **removed in cleanup PR #5**, and the smoke token rotated to a non-valid disabled value. **The ordinary authenticated PDF registration endpoint remains enabled.**
- **Mock E2E/CI tests are separate evidence:** 162 unit/DB tests, 165 API/integration tests, 52 browser E2E tests on PR #4 prior to the real smoke test. Those validated the normal registration UI, authentication/consent and application of fields, but did not invoke Meta.
- The two live calls verified the extraction/model-integration path, **not** a full end-user login and PDF submission to production. Actual production user authentication was not bypassed.
- Single educational sample is **not** a statistical accuracy benchmark. Real registry PDFs may have unusual layouts, scans, outdated records, rights sections, PII or errors. This service does not assert property ownership, legal correctness or safety.
- Application does not persist uploaded PDF through this feature; Meta's own handling of requests is governed by its policies.

## Deployment flags retained
`REGISTRY_AI_ENABLED=true` in both **Preview** and **Production**; `AGENT_PROVIDER=meta` and `MODEL_API_KEY` were already present in both environments. The QA-only token has been disabled, and normal rate limits, authentication, consent and PDF-size restrictions remain in effect.

## Practical demo interpretation
It is now accurate to say **"DirectHome successfully extracted Korean registry address, building identifiers and exclusive area using live Meta Muse Spark 1.3 on both Preview and Production with a fictional educational PDF."**
It would **not** be accurate to say "all real registries work," "ownership is verified," "the AI judges title safety," or "the user's entire production upload journey was verified against Meta."
