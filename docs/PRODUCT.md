# DirectHome — Current Product Overview

**Baseline:** `80a3378`, 2026-10-30. This replaces outdated VS-2 planning text.

## Goal
DirectHome turns Korean real-estate direct-deal conversations into **source-linked, versioned terms requiring explicit acknowledgment from both sides**. Finding a listing is only the first step; the central challenge is distinguishing a question, a wish, a counteroffer, and a mutually acknowledged condition.

## Core user experience
1. Explore 24 **synthetic listings** using map/list views and filters.
2. Open an authenticated, listing-specific private room.
3. Converse with a simulated AI seller for sales or AI landlord for rental/jeonse; human-owned rooms use human chat.
4. Neutral agent **집톡이** extracts condition changes, supporting messages, and ambiguity.
5. When a specific final-condition candidate emerges, the app creates a versioned proposal card.
6. Each party acknowledges the **same proposal version**. Changes never automatically reuse old approvals.
7. Review pending/agreed/revised terms and evidence in the deal-status panel.

## Transaction-specific agreements

| Type | Roles | Final financial proposal |
| --- | --- | --- |
| 매매 / Sale | Buyer and seller | **One final sale price** |
| 전세 / Jeonse | Tenant and landlord | **One final jeonse deposit** |
| 월세 / Monthly rental | Tenant and landlord | **One atomic deposit + monthly rent bundle** |

Wishes and counteroffers are negotiation history, not independent agreement cards. For example, a change from 2,000/85 to 5,000/65 (만원) must not become two unrelated sale-price proposals.

## Two separate AI roles
- **Simulated counterparty:** The seller/landlord has a listing-specific persona and replies naturally. This is not an actual verified owner.
- **Neutral 집톡이:** Interprets Korean dialogue, tracks evidence, organizes and requests acknowledgment; it cannot approve on behalf of a human.
- **Participants:** Human approvals require authorization and the exact condition version. Simulated AI acknowledgment is labeled **demo**.

## Limits
This is a hackathon prototype, **not** ownership verification, a legal contract, real reservation, payment/escrow, licensed brokerage, or legal advice. Synthetic data and AI-demo responses must not be confused with real commitments. CI uses Mock mode; live Meta-model extraction quality needs independent verification.

Further reading: [Overview in Korean](PROJECT_OVERVIEW_KO.md) · [Architecture](ARCHITECTURE.md) · [Verification](VERIFICATION.md).