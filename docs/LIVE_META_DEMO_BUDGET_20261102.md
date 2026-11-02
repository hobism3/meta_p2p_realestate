# Live Meta demo call policy (2026-11-02)

The initial proof-of-concept had **3 Vision + 2 Image lifetime global attempts**, shared across production Vercel functions using atomic private PostgreSQL counters. Successful or failed provider calls consume an attempt to avoid retry-driven charges.

For the hackathon demonstration we allow a small additional, **finite** quota without unlimited Meta API access:

| Model feature | Default global production attempt cap | Hard ceiling | Optional server-only env override |
| -- | --: | --: | -- |
| Vision review (Muse Spark) | 6 total | 12 | `PHOTO_AI_TOTAL_VISION_CAP` |
| Furniture-free edit (Muse Image) | 3 total | 5 | `PHOTO_AI_TOTAL_EDIT_CAP` |

These are lifetime totals, not rates or dollars. Previous attempts already count. The operator can set `0` to disable. Counters must never be reset merely to take more shots at the demo. Per-user hourly quotas stay 6 Vision / 2 Image. Every invocation still requires explicit consent, authenticated user, a manual per-photo click and a validated JPEG; global budget reservations are atomic and deny all calls if database locking/transaction fails. Never expose the server model key or private budget details in the browser. The GET capabilities surface cap numbers only.

**Important:** This does *not* guarantee the user's Meta balance; it only bounds request counts. Muse Image may be considerably more expensive. Monitor Meta provider usage and keep a separate account-side spend cap. Prefer recording the user's already-confirmed real Vision/edit outputs and replaying them as recorded footage for the final film, rather than repeatedly paying to regenerate.

## Live recording checklist
1. Wait for the correct production commit to reach READY; old production code uses 3/2. Vercel's previous error was `402 api-deployments-free-per-day`; this is a deployment/billing limit, NOT a Meta API limit.
2. Sign in to a dedicated test account on the real production domain. Use only fictional or owned, privacy-reviewed photos.
3. For Vision: check the separate transmission checkbox, click exactly one photo's AI analysis, record the button/result and visible room/amenity suggestions.
4. For Muse Image: independently check the image-edit transmission checkbox, click exactly one photo's furniture-free preview, record original vs AI simulation with its warning.
5. If the provider returns an error, never present a Mock image as actual Meta. Preserve the error in internal notes and stop if the global attempt cap is reached.
6. Record a separate nonpaid Local Mock Jiptok two-user story to demonstrate deterministic bilateral confirmation. Source code and existing test assertions support this regardless of paid Meta calls.

The hackathon submission distinguishes screenshots/footage of actual model results from deterministic Mock validation. TTS is a later optional feature requiring a user-controlled play button and privacy review, not an automatically speaking bot.
