# Registry document cases — evidence and evaluation plan

**Source of categories:** [당당, 등기사항증명서 가이드 (2026-05-19)](https://dangdang.io/blog/registry-document-guide).
The guide presents multiple **fictional educational examples** (normal, provisional attachment, mortgage-heavy, combined flags, lease/fixed-date). This document summarizes **test scenarios**, not copied article/PDF content or legal advice. The external example PDFs are **not** committed to our repository.

## What was actually inspected

- User supplied a Korean educational normal-case PDF (`normal.pdf`, 1 page, 908,854 bytes, SHA-256 `2ddff3f07aa134c04456685db796ffb8029e007159eabc3c07c0fad1e87b50`). The document is explicitly labeled fictional/non-binding.
- Its parsing was examined locally with `pdfinfo` and `pdftotext -layout`. The **actual file** passed the PDF header/EOF/encryption and 2MiB/3MiB body-size checks. The app's original Mock only accepted its own generated fixture and would have returned HTTP 422 for this user sample. The PR now recognizes the uploaded normal case **by exact SHA-256 as an explicitly labeled Mock fixture**; this is **not Meta inference**.
- Source website's guide text was reviewed. Individual external danger-case PDFs were not fetched or evaluated in this pass, so the following rows are **planned cases**, not measured model results.

## Ground truth for the user-provided educational normal PDF

| Source section | Field | Ground-truth registration draft | Must NOT select |
| --- | --- | --- | --- |
| Header / `[집합건물]` | address | 서울특별시 가상구 샘플로 10길 101 | Owner name / mock national ID |
| Header | building name | 당당아파트 | Whole-building construction description |
| Header | building number (동) | 105 | Parcel number 101 |
| Header + 전유부분 | unit floor | 5 | 12 (total floors in building) |
| Header + 전유부분 | unit number | 501 | 105 building number |
| 전유부분의 건물의 표시 | exclusive area | **59.84㎡** | 425.30㎡ floor-wide area; 5,432.10㎡ land; 45.21 land-share numerator |
| 갑구 | historic recorded sale amount | **NOT imported** | 500,000,000원 as new asking price |
| 갑구 / 을구 | owners, registered rights | **NOT imported or certified** | Real owner identity or `안전한 등기부` |

**Important:** Successful Mock replay means the pre-entered expected fields match the sample's exact file hash. It does NOT prove the Meta model discovered those facts. Live Meta extraction requires a separate opt-in test with recorded provider, version, input SHA, parsed fields, errors, latency and cost.

## Negative cases derived from the referenced guide

| Case | Document behavior to test | Safe outcome in this registration feature |
| --- | --- | --- |
| Normal registry | 주소/동/호 + 1동 building, 토지, 전유부분, 대지권, 갑/을 | Extract only supported listing identity and unit area, no financial/owner inference |
| Provisional attachment (가압류) | 갑구 includes an ownership restriction | Never certify safe ownership or invent an asking price; separate human review notice |
| Large mortgage / multiple mortgages | 을구 includes financial encumbrances and 채권최고액 | Never use this amount as sale price/deposit; do not calculate a debt-to-price score without independently provided valid market data |
| Mixed auction, attachment, mortgages | Multiple relevant entries across sections | Do not collapse distinct rights or dates into a single blanket safe/unsafe verdict |
| Fixed date / lease registration | 확정일자 and 임차권등기 differ | Do not infer the existence of unlisted rights or current tenant status from absence of a line |
| Canceled and historical rights | `말소사항 포함` contains previously canceled entries | Do not imply an old, canceled right is currently active without valid status reasoning |
| Property identity conflict | Registry address/동호 differs from user input | Preserve user input; display proposed alternative only, request explicit correction |
| Unit type vs land | 토지, 대지권, 층별 면적, 전유부분 area scattered | Accept **only** the unit's supported 전유부분/전용면적; leave unknown blank |
| PII adjacent to section header | Masked IDs and owner names close to address | Do not return PII as an extracted value/evidence or persist the original PDF |

The registration feature deliberately does **not implement legal-rights analysis**. Site case categories are relevant for a future **separate risk-review assist** with legal/privacy review and up-to-date certified documents, not a reason to label a listed property safe.

## Test design and release gates

1. Validate the schema and supporting text consistency: proper building name, 동/층/호, unit area quote with same number and appropriate unit marker.
2. Validate fallback: missing evidence, conflicting evidence, missing sections, or PII → empty draft fields. Never manufacture numbers.
3. Test no sale-price auto-fill from recorded 거래가액, mortgage amounts or owner IDs.
4. Test 2 MiB PDF and 3 MiB request limits, no permanent DB/file storage and explicit consent.
5. Mock: exact-hash recognized educational cases, unknown files refused; provider label must show **Mock**, not Meta.
6. Meta: manual synthetic/redacted PDF smoke at least one real Korean normal case and one negative case, if remaining quota allows. Log only **redacted metadata**, not full PDF or owner details.
7. If rights analysis is ever added, separate claims from **현재 효력**, **말소**, **판단 불가**, require versioned official source checks and legal review. The PR does **not** claim this functionality.

Document parsing and registration are separate from a real property-title lookup, legal advice, mortgage risk calculation, identity verification, or approval to enter a contract.
