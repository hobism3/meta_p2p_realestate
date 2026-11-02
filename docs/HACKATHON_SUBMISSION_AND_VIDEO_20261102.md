# DirectHome — Hackathon Submission & 3-Minute Demo Package
**Draft 2026-11-02 · For Meta Global AI Developer Hackathon, Build for Your World**

## 0. Non-negotiable submission gates
- **Deadline:** November 4, 2026 at 9:00 PM EST = November 5, 2026 11:00 AM KST. Verify the organizer portal again before uploading.
- **Video:** Three-minute demo **required**, not optional. The link must be public/unrestricted for judges. Stage-two Demo weight = 25%.
- **Public repository:** `hobism3/meta_p2p_realestate` is public. GitHub repository creation at **2026-10-26 23:02:31 UTC**, during the Oct 26–Nov 4 hackathon window. Public repo alone does not prove every source/image is licensed.
- **Original contribution gate:** The actual built features and code must be clearly distinguished from Next.js, React, Leaflet, PDF.js, test fixtures, Unsplash/demo photo assets, boilerplate, and preexisting materials.
- **Never claim:** legal ownership verified, official title ranking guaranteed, brokerage service, legally binding agreement, secure deposit, fully autonomous negotiation, or statistical live Meta model accuracy.
- **Don't call a mocked response a live Meta output.** The synthetic automated rehearsal is explicitly watermarked. Capture or attach separately verified Meta response footage before claiming real-model scenes.

## 1. Project in one sentence
**DirectHome helps Korean homeowners create listings and handle routine questions with Meta-powered assistance, while a separate neutral companion keeps buyer/owner conditions transparent, evidence-linked, and confirmed by both people rather than by an AI.**

**User problem:** Real-estate direct trade is hard: sellers repeat mundane tasks; visitors don't know what to verify; chat messages blur proposals, counteroffers, and final conditions.

**Differentiator:** AI suggests, summarizes and routes work — humans decide. Type-specific offer bundles and versioned bilateral confirmation preserve clear accountability.

## 2. Originality / rights evidence matrix
| Shown in video | Relevant code / evidence | New work verification | Honest credit |
| --- | --- | --- | --- |
| Photo-assisted listing | `web/components/ListingPhotoGuide.tsx`, `web/app/register/page.tsx`; PR #43 | GitHub commits Oct 26–Nov 2; real user observed living-room detection | Muse Spark Vision real trial observed once, not an accuracy benchmark; photo examples are third-party or synthetic |
| Virtual furniture-free preview | `web/app/api/listings/photo-empty-view` | User observed functioning generated result once | Muse Image output is a **simulation**, not an actual property |
| Explicit gallery publication | `web/app/api/listings/[id]/gallery`; PR #34, #43 | Auth, upload limits, no AI-generated image publishing | No claim of verified ownership |
| Owner assistant + visits | `web/lib/owner-delegate-service.ts`, `web/lib/owner-ai-job-service.ts`, owner pages | Auditable PR history + isolated CI | Owner policy facts only; human approvals required |
| Neutral Jiptok + bilateral confirmation | `web/lib/real-jiptok-service.ts`, `web/lib/agreement-service.ts`, `web/app/rooms/[rid]/page.tsx` | Audit tests with two signed identities | AI is **not** an autonomous negotiator or contract agent |
| Title-record evidence helper | `web/lib/registry-pdf-local-reader.ts`, `web/lib/registry-rights-analysis.ts` | Educational test corpus and evidence docs | Local deterministic PDF parsing, not necessarily Meta model inference; not legal advice |
| Open-source foundation | Next.js, React, Leaflet, OpenStreetMap tiles, PDF.js, pg, Playwright | Dependency manifests + code attribution | Third-party libraries were NOT authored during the event |
| Demo photos | `docs/PHOTO_DEMO_ASSETS_20261102.md` | Source file paths and license pointer | Secondary upstream credits cite Unsplash; verify the individual image rights before final video |

**Required final check:** The existing project has no top-level license recorded in repository metadata. Public access is verified; an explicit suitable license/notice and third-party image rights review are still recommended before submission. Do not assume secondary repository credits prove original license.

## 3. Three-minute story — visual cut / exact time budget
| Time | Screen and user action | Judges should understand | Evidence type |
| --- | --- | --- | --- |
| 00:00–00:15 | DirectHome English showcase + short problem title | Real-world P2P transaction problem; concrete owner/visitor pain | Real UI |
| 00:15–00:36 | Listing wizard → property facts / rental terms | Time saved on manual setup | Real UI, synthetic input |
| 00:36–01:03 | Add living-room photo, explicit consent → Muse Spark Vision candidate room/amenities | Meta integration + visible user benefit | **Use real recorded model clip if available; else clearly labeled Mock** |
| 01:03–01:22 | Furniture-free before/after via Muse Image | Creative model feature; caveat: simulation | **Real recorded result preferred; otherwise labeled Mock** |
| 01:22–01:43 | Manually confirm amenity → save listing → same photo preserved → explicit publish | End-to-end flow; privacy-first human control | Real UI/API, synthetic listing |
| 01:43–02:04 | Owner settings / AI owner inquiry & visit availability | Real operational value; clear delegation boundary | Test account or Mock |
| 02:04–02:33 | Two-person deal room, Jiptok evidence/proposal card; one accepts then other | Conversation is not consent; same-version bilateral approval | Real UI/API, signed synthetic identities |
| 02:33–02:46 | Browser-local educational registry document evidence | Evidence and what remains uncertain | Synthetic educational PDF |
| 02:46–03:00 | Source tree / CI evidence / English closing card | Craft, original contributions, limitations, public source | GitHub code + working app |

**Editorial guidance:** Do not squeeze every screen into one rapid montage. Prefer visually persuasive moments: AI finding real amenity candidates, empty-room comparison, one-click explicit publication, and two-party confirmation state change. Keep text readable on a phone screen.

## 4. English narration script (target ~370 words)
**00:00–00:15**  
"Renting or buying a home directly should be simple. But property owners repeat the same tasks, and people browsing a home are left to untangle documents, messages, and deal terms on their own. Meet DirectHome."

**00:15–00:36**  
"An owner starts with a guided listing. Instead of opening five disconnected tools, they enter the essentials in one clean flow. The information remains editable, and nothing is published without review."

**00:36–01:03**  
"With explicit consent, Meta Muse Spark Vision can inspect a property photo, identify its room type, and suggest visible amenities. These are only candidates. The owner chooses which items are actually provided. The app also spots photo coverage gaps, like a missing bathroom image."

**01:03–01:22**  
"Meta Muse Image can create a furniture-free visualization alongside the original. This is a clearly labeled AI simulation — not a guarantee about unseen surfaces, room dimensions, or the condition of the home."

**01:22–01:43**  
"Once the listing is saved, the same reviewed photos stay in the workflow. No second upload. After a separate privacy and publication check, only the chosen, compressed real-photo derivative appears in the gallery. The AI-edited image is never published as a real property photo."

**01:43–02:04**  
"An owner assistant answers repeat questions based on the facts the owner supplied. Questions requiring judgment are returned to the owner's task list. Visit requests stay pending until the owner approves them."

**02:04–02:33**  
"Now watch the transaction. Our neutral assistant, Jiptok, tracks what was proposed and what remains open. If one person agrees to a rent-and-deposit package, the deal is not confirmed. Only when both approve the same version does the status change. The assistant never negotiates, signs, or transfers money for them."

**02:33–02:46**  
"Local registry PDF analysis surfaces evidence and missing checks without uploading the personal document to an AI model. It is guidance, never legal verification."

**02:46–03:00**  
"DirectHome combines practical Meta AI features with a carefully constrained workflow. Built during the hackathon, with public code and automated tests. Humans remain in control of every consequential decision."

## 5. How to produce footage
1. **Automated mock rehearsal:** `web/scripts/record-hackathon-demo.mjs`, GitHub Action `hackathon-demo-rehearsal`. Uses isolated SQLite, synthetic images and explicit top watermark, no Meta charges. Exported 1280x720 MP4 is **not** final live-model proof.
2. **Actual Meta clips:** Record the approved test account or synthetic photo with Meta feature enabled. Capture the full input/button/output transition and preserve the user-facing consent. Avoid showing API keys, owner documents, email addresses, browser profiles, or personal auth tokens.
3. **Video editorial pass:** Replace Mock-only AI frames with genuine recorded model results, add English narration and/or captions, trim to <= 180 seconds, and keep all caveats.
4. **Technical credibility:** Overlay a few seconds of code or GitHub CI results only if the code is visible and truly part of the project. Don't use decorative fake analytics.
5. **Verify public video link:** Open it in an incognito/logged-out browser; require no login or download credentials.

## 6. Submission package checklist
- [ ] Public repository URL and live Production URL open without login (except actual private actions).
- [ ] Clear hackathon-new code list, dependency notices, and rights for every visible external media asset.
- [ ] 3-minute video published and publicly accessible; exact link inserted into submission.
- [ ] English title/voiceover or captions suitable for international judges.
- [ ] If production has Meta calls limited, label Mock routes clearly and keep proof of real calls separate.
- [ ] Add all participants to the portal; designate one representative.
- [ ] Final manual smoke test on the exact Production commit and deployed URL.
- [ ] Correctly distinguish seeded fictional listings, actual published user-submitted test listings, and real ownership verification (not offered).
- [ ] Copy repository URL / video URL / live URL to organizer portal **before** deadline; verify confirmation.

## 7. Remaining UX release gates
- Photo flow: uploaded images persist in the current React tab after saving; they do **not** survive full reload or cross-device sessions. Explain this and offer owner gallery management.
- Navigation: KR/EN switching currently covers global navigation and the complete hackathon walkthrough. Remaining product input/transaction screens are Korean-first and should not be represented as fully localized.
- Mobile: verify readable 390px viewport across registration success, photo cards, consent toggles, published gallery, and deal room. Playwright passing does not replace visual inspection.
- Media rights: the credited external photos' individual source ownership is not independently verified; do not claim these were AI-generated or owned by the team.
- Operations: production image storage is still a PoC and needs proper storage/access lifecycle for a real launch. Registry ownership/legal risk not certified.

## 8. Recommended pitch emphasis per rubric
- **Impact 30%:** reduce owner effort, make conditions explicit, guide visitor checks. Show a real before/after task reduction, not speculative business metrics.
- **Meta AI tooling 25%:** Muse Spark Vision with explicit human confirmation, Muse Image visualization, dialogue/assistant role separation. Say exactly which scenes are live.
- **Technical execution 20%:** same-version bilateral confirmation, permission boundaries, deterministic integration tests, local PDF processing, per-photo consent and call budget.
- **Demo 25%:** a stable three-minute story with readable mobile-friendly UI, real functionality, honest labeling, reliable video URL.

See also `docs/DEMO_GUIDE.md`, `docs/P16_HACKATHON_SHOWCASE_20261102.md`, and `docs/PHOTO_DEMO_ASSETS_20261102.md`.
