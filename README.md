# DirectHome — Talk naturally. Agree clearly.

**DirectHome** is an AI-assisted, peer-to-peer real-estate negotiation prototype built for the **Meta Global AI Developer Hackathon** (*Build for Your World*).

**Live demo:** https://meta-p2p-realestate.vercel.app/  
**Repository:** https://github.com/hobism3/meta_p2p_realestate  
**2026-11-01 legal review baseline:** `main@94108e1` (legal patch branch changes are not verified production releases)

> **Problem:** Finding a property is only the beginning. Buyers and sellers negotiate price, deposits, rent, visits, handover, and move-in dates in free-form messages. A wish, a counteroffer, and an accepted condition can be easily confused.
>
> **Solution:** DirectHome transforms those conversations into **traceable, versioned proposals requiring explicit acknowledgment from both sides**.

## The experience

1. **Find a property** in map or list view, filtered by sale, jeonse, or monthly rent.
2. **Open a private deal room.** Synthetic listings include an AI seller/landlord for an immediate demo conversation.
3. **Negotiate naturally** in Korean, powered by Meta Muse Spark via the server-side Meta Model API.
4. **Let 집톡이 (Jibtalki) observe.** A separate neutral AI identifies conditions and source messages, tracks changes, and points out unresolved items.
5. **Agree explicitly.** A *final price* (sale), *final deposit* (jeonse), or *deposit + monthly rent* bundle (monthly rent) becomes one proposal card. Both sides must acknowledge the **same version**.
6. **Review deal status** with evidence, revision history, and which side has acknowledged each proposal.

### Illustrative Korean dialogue

```text
Original monthly rental: 보증금 2,000만원 / 월세 85만원
Tenant: "보증금을 5,000만원으로 올리고 월세를 65만원으로 할 수 있나요?"
AI landlord: "네, 보증금 5,000만원과 월세 65만원으로 조정 가능합니다."
집톡이: "보증금 5,000만원 / 월세 65만원 조건에 동의할까요?"
[임차인: 동의 대기]  [AI 임대인: 시연 동의]
```

**Important:** The AI counterpart is synthetic; demo consent is not a legally binding signature or a real-life reservation. Actual Meta outputs can vary. The dialogue above is illustrative, not a guarantee of identical model responses.

## Seller-side convenience: Meta-assisted listing draft

Owners and landlords can now open **매물 등록** and try the optional **등기 PDF → AI 등록 초안** experience. Muse Spark can extract document-supported address and explicitly identified unit area to an editable preview; the user must still provide prices, management fee, move-in and options and press the final listing-submit button. A completely fictional PDF is downloadable for a no-credit Mock demonstration.

**Privacy and integrity:** The demo warns against uploading real unredacted title records. The Meta PDF path is now restricted to **exact-hash fictional demonstration PDFs only** with client and server checks; arbitrary real registry PDFs are forbidden. Server configuration and explicit acknowledgement are still required; no PDF is stored by this feature in the app database. Extraction is **not** ownership verification or automatic publication. See [Document-to-Listing technical guide](docs/REGISTRY_AI_IMPORT.md).

## Why two AI roles?

| Component | Responsibility |
|---|---|
| **AI seller / AI landlord** | Persona-specific simulated negotiation using the chosen property's facts and current room context |
| **집톡이, the neutral assistant** | Evidence-linked condition extraction, normalization, clarification, and proposal/approval workflow |
| **Human participants** | Explicit approval or rejection on a versioned proposal; authenticated room membership |

The system does **not** simply generate a summary. It separates **conversation → supported conditions → final-condition candidate → bilateral acknowledgment**, with trade-type validation and revisions.

## Built and verified

- **Frontend:** Next.js 14, React 18, TypeScript, Leaflet with OpenStreetMap tiles.
- **Backend:** Next.js API routes; isolated SQLite tests / configured PostgreSQL backend.
- **Models:** Meta Muse Spark (`muse-spark-1.3` default), server-side invocation, separate `mock` provider for repeatable development and CI.
- **Safety boundaries:** role-scoped room access, message evidence, typed trade conditions, version-safe decisions, idempotency controls.
- **CI at baseline commit:** 144 unit/DAL tests + 164 API/integration tests + 28 Playwright browser cases passed. **These are Mock/isolated-DB checks, not measured live-model accuracy.**

## Start locally

```bash
cd web
npm ci
npm run dev
```

Start with the Mock provider; real Meta calls require server-only `AGENT_PROVIDER=meta` and `MODEL_API_KEY`. Login, database, and hosted operation require appropriate environment configuration. Do not commit credentials or use real people/real listings in the demo.

## Documentation for reviewers

- [한국어 제품 소개](docs/PROJECT_OVERVIEW_KO.md)
- [Judge Guide: evidence and differentiation](docs/JUDGE_GUIDE.md)
- [2–3 minute demo walkthrough](docs/DEMO_GUIDE.md)
- [Architecture and Meta model integration](docs/ARCHITECTURE.md)
- [Tests, limitations and live-model proof](docs/VERIFICATION.md)
- [Submission-ready copy](docs/SUBMISSION_TEXT.md)
- [Meta-assisted document-to-listing draft (seller flow)](docs/REGISTRY_AI_IMPORT.md)
- [한국 직거래 법률 심층 검토](docs/legal/LEGAL_DEEP_DIVE_20261101.md)
- [법률 보완 추적 원장](docs/legal/LEGAL_ISSUES_20261101.md)

Historical roadmap and initial product specs are retained for project history; use these linked documents for the current state.

**Limitations:** Seed listings are synthetic, but user-created listings can also appear and have **not** been verified for ownership, posting rights or truthfulness. No escrow/payment, electronic contract signing, title verification or legal advice is provided. Actual owner-approved visit booking records can exist, but do not guarantee a visit occurs. Bilateral cards record in-app acknowledgments and are not an electronic-contract service; actual chat/acceptance may nevertheless have legal effects depending on the facts. See [Korean legal deep dive](docs/legal/LEGAL_DEEP_DIVE_20261101.md).