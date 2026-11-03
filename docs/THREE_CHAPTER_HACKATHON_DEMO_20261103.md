# DirectHome — Three-Chapter Hackathon Demo (2026-11-03)

**Final narrated 2:55 demonstration:** [GitHub Release](https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-three-chapter-demo-20261103)  
**Live product:** https://meta-p2p-realestate.vercel.app/

This is a real browser recording of DirectHome's Next.js web application, edited to three coherent chapters. The soundtrack runs throughout, in clear English. The three chapters reflect the intended product journey, not a standalone gallery of model results.

## Chapter 1 — Register a property from an educational record and photo

1. The SAME original fictional Korean title-record PDF is submitted through the `/register` screen and later re-used in Chapter 3. Its exact fixed SHA-256 is `7624c8384271e6ebd5bc092263066432db3656b74454272d9fb33a5144d59403`. The *registration field extraction is a deterministic educational Mock* (strict SHA-256 match), not a fresh or official Meta registry-document analysis. The visible address and exclusive unit area appear in editable registration fields. The owner enters their own rent and deposit; nothing is published on inference alone.
2. In the *actual* DirectHome photo studio, the screen uses a pre-recorded genuine Muse Image-generated Korean apartment photo. Its source SHA-256 is `af59759ed94169864d77587608dcc8f88e87b74f75f591351a06f883390a47c5`.
3. The actual pre-recorded Muse Spark 1.3 response `room: living_room, features: ['에어컨']` is replayed **inside the existing photo analysis UI**, from the independently preserved `vision_actual.json`. A small provenance badge says `Recorded Meta model output`. This replay does not make another API call or invent a response.
4. The same photo editor displays the genuine Muse Image-produced empty-furniture WebP `23fdd7e442487566dc05052b94aad69065bec2aaba40e9ae3919b15bdf221ded` inside its original/edited comparison component. Hidden surfaces in the empty view are an AI simulation and are **not evidence of real property condition**.
5. The fictional owner confirms draft fields and saves the synthetic listing.

## Chapter 2 — Jiptok keeps a transaction on track

- Two **synthetic test identities** open an actual deal room; the exchange about a deposit and monthly rent becomes a versioned proposal.
- The neutral Jiptok digest and proposal card organize confirmed vs pending terms. It is **not** automated negotiation.
- The visitor acknowledges one version. The UI still shows the owner's acceptance pending. Only when the second participant acknowledges the *same version* does the status change to both confirmed.
- Neither a Jiptok summary nor bilateral in-app confirmation is a legally signed contract, payment or verified identity.

## Chapter 3 — Rights review from a fictional educational PDF

- The **exact same source PDF** used to prefill the registration is revisited for the rights review. It is a self-authored one-page **Korean educational title record**, byte-reproducible with ReportLab `invariant=1` via `web/scripts/make-educational-rights-pdf.py`. It does **not** represent an official court-issued record or a real address.
- In the running `/registry/extract` screen, **browser-local** PDF.js extracts the Korean text layer and finds 3 candidates: a provisional seizure/가압류 entry and 2 mortgages/근저당 entries with quoted maximum secured amounts of ₩120m and ₩60m.
- The recording includes a small inset of this same synthetic PDF (not a separate introductory slide) while showing the product's extracted candidate cards.
- The fictional user marks only the records compared to the original and transfers approved structured fields to `/registry/check`. The resulting checklist highlights additional verification questions; **there is no legal safety certification or automatic valuation of unregistered rights**.

## Voice, rights and disclosures

The initial edit has English narration throughout from a **neural text-to-speech voice**, replacing the earlier robotic eSpeak voice. No TTS was added to the Jiptok service itself. The narration was generated exclusively for the demonstration, not with participants' voices. The soundtrack contains no externally licensed music. A separately tested Apache-2.0 Kokoro open-weight TTS alternative is available if the final publisher requires a more explicit model/output rights chain.

Video disclosure labels distinguish:
- *Recorded Meta model output* (actual prior Meta requests, reused in product UI) from
- *Educational synthetic data · Mock AI* (registry draft and synthetic Jiptok dialogue).

This is **not** a new live production-billing video, an assertion that the registry PDF was analyzed by Meta, or a demonstration of a legally completed real-estate trade.

## Reproducibility and GitHub storage

- `web/scripts/record-three-chapter-demo.mjs`: records the real Next.js application via Playwright, local SQLite and fictional identities; no paid Meta calls.
- `web/scripts/make-educational-rights-pdf.py`: creates the fictional Korean PDF with clear disclaimer.
- `web/scripts/generate-natural-demo-voice.py`: complete English narration script, timed across 15 sections.
- `web/scripts/assemble-three-chapter-demo.py`: precise 175-second composition with evidence-source footnotes.
- GitHub Action `directhome-three-chapter-film`, run `41549468183`: full application E2E screen recording including 3 rights candidates, registration, and both-person confirmations.
- GitHub Action `directhome-natural-narration`, run `41548065231`: English voice stems.
- GitHub Action `directhome-three-chapter-final-video`: encodes and stores final MP4 and synthetic registry PDF as authenticated Actions artifacts. On main it publishes versioned public **GitHub Release assets**, not multi-MB binary Git commits.
- The original Meta provider JPEG, WebP and JSON are preserved in the independent public [real-model evidence release](https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-real-meta-demo-20261103).

**License/safety boundary:** Source imagery used for the first chapter is newly generated using the project's real Meta Model API account, not a third-party photograph. All original educational PDFs in the film are authored by this project. Third-party libraries and TTS licensing should be rechecked under the hackathon's terms before final submission.
