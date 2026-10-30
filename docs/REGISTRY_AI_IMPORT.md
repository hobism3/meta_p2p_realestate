# Document-to-Listing: Meta AI Registration Draft (hackathon prototype)

**Feature route:** `/register` → "등기 문서로 등록 초안 만들기".

## Product value
DirectHome now helps **both sides of a direct transaction**:
1. Buyer/tenant: AI counterpart negotiation, neutral 집톡이, two-party proposal review.
2. Seller/landlord: an optional **document-to-draft** step that reduces repetitive listing-form entry.

**This is document-assisted drafting, not automatic publishing, ownership certification, or legal due diligence.**

## Flow
1. Download the provided **completely fictional PDF example**. It is not an official title certificate.
2. Open `/register`, attach the sample PDF, check the explicit disclosure/consent and click analyze.
3. In Mock mode, **only the exact supplied sample bytes** are recognized. This makes offline CI/demo deterministic without spending credits.
4. When enabled, Meta Model API `muse-spark-1.3` receives the **redacted PDF inline** as a file part and returns a structured JSON result.
5. The human sees **document excerpts** for address, explicit exclusive floor area, building type, floor and unit.
6. Click "비어 있는 등록 항목에 반영하기" to populate **empty** fields. Existing manual input is retained.
7. The user must still enter and verify sale/deposit/monthly rent, maintenance fee, move-in, amenities and publisher name, then explicitly submit the ordinary listing form.

## Korean educational PDF acceptance case (user-provided)

A one-page Korean title-record **fictional educational sample** was examined offline (908,854 bytes; SHA-256 `2ddff3f07aa134c04456685db796ffb8029e007159eabc3c07c6c0fad1e87b50`).
The document's PDF signature, trailer, size and inline JSON request limits pass; the original user-uploaded file is **not published or copied into the repository**.

The previous Mock recognized only our own PDF generator; therefore this new file would have been rejected as **422**. This PR now adds an **exact-hash offline Mock fixture** that yields the following known answer for UI testing, and remains visibly labeled "Mock" (never "Meta"):

| Field | Expected draft |
| --- | --- |
| Address | 서울특별시 가상구 샘플로 10길 101 |
| Building | 당당아파트 |
| Building dong/floor/unit | 105동 / **5층** / 501호 |
| Exclusive unit area | **59.84㎡** |
| Original asking price | **Blank / user input required** |

The PDF also contains **12층** (building's total floors), **425.30㎡** (whole floor), **5,432.10㎡** (land), and a **historical registered sale amount**. None must be substituted for the unit's floor, exclusive unit area or current asking price. The Meta schema and field validator were refined accordingly, including buildingName/buildingDong, explicit area-number matching and unit-label evidence.

**This is not a live Meta benchmark.** A hash-matched Mock fixture demonstrates upload/preview/apply workflow only; real inference remains gated and must be measured separately.

For further synthetic edge cases and the rights-versus-registration boundary, see [Registry Sample Cases](REGISTRY_SAMPLE_CASES.md), based on the external [당당 educational guide](https://dangdang.io/blog/registry-document-guide). Those external PDFs are not checked into our repository and their legal-risk categories are not automatically decided by this feature.

## What the document does *not* tell us

| May be present in a registry | Not safely inferred |
| --- | --- |
| Address and registered building/parcel identifiers | Actual listing photos, appliances, furniture |
| Exclusive unit area **if explicitly labeled** | Monthly rent, deposit, sale offer, maintenance |
| Registered floor/unit | Pet policy, utilities, move-in timing |
| Historical rights entries (excluded from import) | Owner identity certification or current property safety |

A land-share area, gross floor area, building footprint and exclusive living area are distinct. The extractor leaves the form's area blank unless **전유부분/전용면적/exclusive floor area** is explicitly supported. Output "evidence" is a model-suggested excerpt for user comparison, **not cryptographic verification against PDF bytes**.

For real deployments, consider building ledgers (건축물대장) as an additional optional source, with separate field semantics and no blind merging.

## Safety, privacy and provider behavior

- This demo **explicitly warns against uploading unredacted real documents.** Property records may contain owner names, identification numbers, liens and other sensitive details.
- In Meta mode, the UI requires consent to transmission to Meta. `REGISTRY_AI_ENABLED=true` must be enabled **on the server**; `MODEL_API_KEY` remains server-only.
- A PDF goes **inline in one chat completion request** (no persistent Meta Files API upload). No raw file, owner data, full prompt or response is saved to the application DB or logs by this feature. Handling by Meta itself is governed by its own service terms.
- `AGENT_PROVIDER=mock` (default): only the exact synthetic example is accepted, and no external API call occurs. Other files receive a clear error, never fabricated extraction.
- Server checks authentication, explicit consent, filename and PDF signature, 2 MiB file cap / 3 MiB request cap, rate limiting (3 analyses per user/hour per instance), `READ_ONLY`, `WRITE_TOKEN` and PDF encryption marker.
- Rate limits are **in-memory per instance**, not distributed/production-grade. A production deployment would require a shared quota store and legal/privacy review.
- The AI-generated fields are normalized and bounded, but source excerpts are **not machine-verified** against the original PDF. Users must review the draft.
- Do not describe the feature as certified title/ownership verification, automatic listing publication, legal advice or fraud detection.
- No live Meta document benchmark has been executed by this PR; test reports must distinguish Mock from real model output.

## Configuration

```text
AGENT_PROVIDER=mock                      # default, no paid calls; synthetic example only
AGENT_PROVIDER=meta                      # model-backed analysis
REGISTRY_AI_ENABLED=true                 # explicit extra server flag required for Meta PDF processing
MODEL_API_KEY=<server-only-secret>
MODEL_MODEL=muse-spark-1.3               # optional
```

Local dev also needs the existing authentication and write-token configuration. CI remains on Mock and isolated DB and does not require a Meta key. Metadata files and user-uploaded PDF content are not committed to the repository.

## Technical locations

- `web/lib/registry-draft.ts`: PDF sample generator, strict preview normalization, exact-hash offline educational Mock fixtures and Meta request body.
- `web/app/api/listings/import-registry/route.ts`: bounded authenticated POST and ephemeral Meta call.
- `web/app/api/listings/import-registry/sample/route.ts`: fictional PDF download.
- `web/components/RegistryImport.tsx`: file selection, disclosure, preview, deliberate apply.
- `web/app/register/page.tsx`: integrates draft with the existing mandatory manual registration fields.
- `web/tests/registry-draft.test.mjs` and browser E2E: deterministic proof without paid provider calls.

## Future production requirements (outside hackathon MVP)

1. Independent extraction of PDF text and *verbatim verification* of evidence spans, plus scanned/image-only PDF coverage.
2. Client-side or trusted local redaction/PII detection before third-party transmission. User checkbox alone is not an adequate production privacy control.
3. Automated source-type detection, field-by-field provenance with page references, timestamps, duplicate detection and human correction trails.
4. Shared rate limiting, resource caps, upload malware scanning, accessibility and legal/privacy/security review.
5. Actual Meta smoke benchmark with synthetic/redacted samples across apartment, detached house, land, scanned and mixed layouts.
