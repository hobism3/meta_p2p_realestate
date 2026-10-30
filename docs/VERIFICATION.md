# DirectHome — Verified Evidence & Limits

**Commit tested:** `80a3378ae96e569850c1b36a92e3887a658d5c8b` (before final UI/docs patch).

| Check | Observed CI result | Evidence |
| --- | --- | --- |
| Build + unit/DAL | 144/144 pass | [verify-fast](https://github.com/hobism3/meta_p2p_realestate/actions/runs/40972572899) |
| API/integration and security regressions | 164/164 pass | [verify-fast](https://github.com/hobism3/meta_p2p_realestate/actions/runs/40972572899) |
| Browser desktop/mobile flows | 28/28 pass | [verify-e2e](https://github.com/hobism3/meta_p2p_realestate/actions/runs/40972572716) |

**Interpretation:** These results used Mock AI and isolated local test DBs. They **do not measure real Meta Muse Spark extraction accuracy**, production latency, or user adoption. The final UI PR requires its own CI run.

## Representative behaviors
- Monthly rent: 2,000/85 → 5,000/65 as one bundle; no separate approval of both money amounts.
- Sale: buyer wish vs seller counteroffer vs one final price.
- Versioned approval/decline/change, room authorization, cross-room isolation.
- Relative date and visit ambiguity checks; no real-world booking promise.
- Responsive listing, map and conversation flows.

## Known limitations
All seeded properties/personas are **synthetic**. The app does not verify seller ownership, execute payments or legal contracts, issue legal advice, or arrange external real reservations. A demo AI acknowledgment is not a real counterparty's consent. Model outputs are nondeterministic, so limited manual Meta testing is important.

## Low-credit submission validation
Use `AGENT_PROVIDER=mock` for automated runs. Then manually run one Meta-powered rental and one sale scenario with exact input/output, model, time and errors logged without private details. Record a 2–3 minute demonstration and verify the deployed homepage/login flow. Link artifacts only when they exist.

[Reviewer guide](JUDGE_GUIDE.md) · [Demo](DEMO_GUIDE.md).