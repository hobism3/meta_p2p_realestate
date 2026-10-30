# DirectHome — Judge's Quick Guide

**One-line pitch:** Natural-language real-estate negotiation becomes evidence-linked, versioned proposals requiring two-party acknowledgment.

**Live demonstration:** https://meta-p2p-realestate.vercel.app/  
**Source:** https://github.com/hobism3/meta_p2p_realestate  
**Evaluated code baseline:** `main@80a3378` (2026-10-30 KST)

## The user problem
In peer-to-peer real estate, people negotiate sale price, deposit, rent, visit, contract date, handover, and move-in through unstructured messages. A wish or counteroffer is easily confused with accepted terms.

## What distinguishes DirectHome
- **Two AI roles:** a simulated seller/landlord who speaks, and a separate neutral **집톡이** who organizes evidence.
- **Typed Korean domain reasoning:** sale, jeonse and monthly rent have *different* valid financial terms.
- **Conversation ≠ consent:** conditions are sourced from messages, validated, versioned, and accepted by each party rather than silently treated as a contract.
- **Reproducible system:** private room access, idempotent agent execution, E2E flows and regression tests.

## Two high-value demonstration cases
**Monthly rent (s02):** original deposit/rent 2,000/85만원 → requested 5,000/65만원; AI landlord replies; 집톡이 offers **one combined deposit+rent card**, not separate sale-price cards. The user then explicitly acknowledges the same card.

**Sale (s23):** original 72,000만원, buyer wishes 70,000만원, seller counters 71,000만원. These remain distinct until the parties agree on *one final price*. A counteroffer is not a final agreed sale.

## Source code evidence
- `web/lib/agent-service.ts`, `web/lib/meta.ts`: Meta-capable persona-based AI responses.
- `web/lib/ziptalk-service.ts`: neutral assistant, extracted conditions and evidence.
- `web/lib/rent.ts`: trade-type normalization and rental bundle.
- `web/lib/agreement-service.ts`: same-version bilateral proposals/approvals.
- `web/app/rooms/[rid]/page.tsx`: proposal cards and deal panel.
- `.github/workflows/verify-fast.yml`, `.github/workflows/verify-e2e.yml`: independent CI evidence.

**Verified CI at baseline:** 144 unit/DAL + 164 API/integration tests, and 28 desktop/mobile browser E2E tests passed. **These are deterministic Mock tests, not statistical measures of live Meta quality.**

No actual property ownership, legal contract, payment, legally binding electronic signature, or real reservation is claimed. All seeded properties and simulated AI owners are fictional.

[2–3 minute demo](DEMO_GUIDE.md) · [Technical details](ARCHITECTURE.md) · [Verification and limitations](VERIFICATION.md).