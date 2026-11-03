# Submission Cut: Rights-Safe Registry + English Jiptok Captions

**Repository:** https://github.com/hobism3/meta_p2p_realestate  
**Live product:** https://meta-p2p-realestate.vercel.app/  
**Release:** https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-three-chapter-demo-20261103

## Final preferred video

`DirectHome_3Chapters_Kokoro_English_Chat_Captions_20261103.mp4`

- Runs **175 seconds**; retains the naturally narrated Kokoro voice, original 16:9 product walkthrough, and the existing accurate provider/Mock disclosure badges.
- **Chapter 1 — Listing:** The **same ORIGINAL DirectHome-generated fictional Korean title-record PDF** appears on the right as an inset while the live app extracts its address and 59.84 m². The user verifies the draft. Existing verified actual Meta Vision result showing `living_room` and `에어컨` and the furniture-free Meta edit are replayed **inside the product UI** with a small provenance badge.
- **Chapter 2 — Jiptok:** The Korean synthetic chat stays intact on the left. A **separate, clearly labeled English translation/status panel** appears beside it on the unused right-hand side. It conveys (1) the owner's proposed 30 million KRW deposit and 680,000 KRW monthly rent, (2) Jiptok's advice that both participants must confirm, (3) visitor-approved / owner-pending, and (4) confirmed by both / independent title and contract checks. These are editorial captions of the recorded synthetic chat, **not a live translation feature or fresh Meta inference**.
- **Chapter 3 — Registry:** The original DirectHome-authored fictional PDF is shown inside the actual browser-local PDF extraction and rights-review workflow. Its one provisional seizure and two mortgages are educational examples, NOT evidence of real legal risk.

## Why the uploaded Dangdang `normal.pdf` was not copied

The uploaded one-page `normal.pdf` identifies itself as a **Dangdang-created educational sample** of a normal title record (ownership transfers, no active liens in Eul-gu). The referenced Dangdang article says its PDF/images are educational fictional samples but does **not** grant reuse, adaptation, redistribution, or public hackathon-video licensing. An educational label or public download is **not a reuse license**. Because the event excludes projects using assets without adequate rights, no raster, image, or reproduction of the Dangdang sample is included in the public film or repository. Our own fictional PDF is independently authored under `web/scripts/make-educational-rights-pdf.py`, with a clear not-official disclaimer and no court emblem.

The user's uploaded document can still be useful for private comparison of capabilities; it is not a public film asset absent permission from the publisher.

## Production synchronization

Merging to the Git-connected `main` branch normally triggers a Vercel Production build, **but GitHub merge success is not proof of a READY production deployment**. The product commit, Vercel production deployment SHA, live `/api/health`, and live allowed fictional-PDF SHA should be independently compared. After merging Kokoro PR #55, the production branch and READY deployment both matched `579081277d7aed34b243d66d09cbf14cf1ffd13d`. At that time the public registry capability endpoint recognized the same authored educational PDF SHA `7624c8384271e6ebd5bc092263066432db3656b74454272d9fb33a5144d59403` and one-hour runtime errors were absent.

## Original evidence vs demonstration

The software and site are a prototype. The *registration* PDF auto-fill is a SHA-verified **deterministic educational Mock**, not a real-time Meta registry OCR. Existing actual Meta Vision & Muse Image results were genuinely generated in an earlier captured provider session and then accurately replayed inside the application studio; this film does not spend new credits. Jiptok bilateral agreement is driven by synthetic, authenticated local test actors and persisted proposal state. Independent legal verification, professional title review, and signature handling are out of scope.

## Build and acceptance

- Editor source: `web/scripts/overlay-english-jiptok-captions.py`.
- Release CI: `.github/workflows/publish-jiptok-english-chat-captions.yml`.
- Inputs: previously released verified Kokoro film and exact authored PDF (both public Release assets). No new model or TTS calls.
- Output: ~175-second H.264/AAC MP4, with the same audio stream copied; QA stills at 18s (original PDF), 94s (English Jiptok captions), 119s (bilateral status).
- Keep the original Kokoro and initial neural English video available for audit; never silently overwrite them.

Before submission: open the **new** MP4 and Production in an incognito browser, ensure the release is public, check captions in the Jiptok section, and submit video/product/repository URLs before the stated deadline.
