# DirectHome — Implemented Architecture

**Verified baseline:** `80a3378`. This replaces early architecture plans and does not claim the draft features were implemented.

```text
Next.js React user interface (listing/search, room, chat, deal panel)
  → authenticated API /api/rooms/[rid]/messages
  → /agent/invoke (synthetic room only): listing+persona+history → Meta Muse Spark OR Mock
  → persisted AI-counterparty reply
  → /ziptalk/invoke: room evidence + trade type → separate Meta/Mock analysis
  → server validation / typed extraction / condition history
  → proposal generation / bilateral decision APIs
  → versioned room_proposals, proposal_approvals → chat card + deal status
```

## Relevant implementation
| Concern | Code |
| --- | --- |
| UI, messages and proposals | `web/app/rooms/[rid]/page.tsx`, `web/lib/store.ts` |
| Synthetic listings | `web/lib/listings.ts`, `web/lib/personas.ts` |
| AI counterparty | `web/lib/agent-service.ts` |
| Neutral assistant | `web/lib/ziptalk-service.ts` |
| Trade-type parsing | `web/lib/rent.ts`, `web/lib/visit-dates.ts` |
| Versioned approvals | `web/lib/agreement-service.ts`, `web/db/migrations/011_proposals.sql` |
| Meta Model API | `web/lib/meta.ts`: `muse-spark-1.3` default, server key only |
| DAL and auth | `web/lib/dal.ts`, `web/lib/auth.ts`, `web/lib/rooms.ts` |

## Validation boundaries
Room membership isolates conversations. An AI reply is *not* automatic bilateral consent. The server normalizes colloquial amounts and dates and requires source-message evidence. Proposals track source, status, version, and per-side acknowledgment; changing a proposal does not inherit stale approval.

SQLite is used for isolated development/test runs; PostgreSQL is supported through DATABASE_URL. AGENT_PROVIDER defaults to mock. Actual Meta invocation requires AGENT_PROVIDER=meta and a **server-side MODEL_API_KEY**. Never expose model keys, token secrets or real personal information.

See [Verification](VERIFICATION.md) and [Demo Guide](DEMO_GUIDE.md).