# DirectHome — Actual Meta Model API evidence (2026-11-03 KST)

**Reproducible release:** https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-real-meta-demo-20261103

The real API evidence was generated at 2026-11-02 23:16:04 UTC (2026-11-03 08:16:04 KST), using the existing project's configured server-side Meta Model API credentials. The operator used a **temporary, production-only HMAC-guarded one-shot QA endpoint**, not a simulated chat completion or a fake response. That endpoint is removed from the repository after collection. There was no permanent bypass of the ordinary, logged-in owner photo endpoints.

## Actual sequence and findings

| Action | Model | Calls | Actual result |
|---|---|---:|---|
| Generate synthetic Seoul apartment living room with sofa, TV and floor-standing air conditioner | `muse-image-1.0` | 1 | HTTP 200; genuine JPEG received |
| Identify room and visually identifiable amenities from exactly that generated image | `muse-spark-1.3` | 1 | HTTP 200; `room= living_room`, `features=["에어컨"]`, `privacyFlags=[]` |
| Create empty-furniture virtual preview from the identical source image | `muse-image-1.0` | 1 | HTTP 200; WebP generated |

**Original SHA-256:** `af59759ed94169864d77587608dcc8f88e87b74f75f591351a06f883390a47c5` (533,098 bytes)

**Edited SHA-256:** `23fdd7e442487566dc05052b94aad69065bec2aaba40e9ae3919b15bdf221ded` (379,544 bytes)

The source image genuinely depicts a cream L-shaped sofa, a TV, a low coffee table and a standing air conditioner in a Korean apartment. The edited image removes all major movable furniture and the standing AC while maintaining a plausible wall/window/floor layout. Occluded surfaces are AI-inferred, so the preview does **not** certify a real empty unit, structural safety, room size or undisclosed defects.

## Evidence and release policy

The **GitHub Release assets** hold the narrated ~2m50s video, actual generated source JPEG, real Muse Image edit WebP, allowlisted actual Vision response JSON, provenance manifest, and the original scripted Mock app walkthrough video. Original synthetic evidence and app code are distinguishable. No real person's property photo or API credential is in the assets.

The narrated video is honest about its composition:
- Opening segment: screenshots of **actual Meta API outputs**, replayed in an edited video. The actual source bytes, expected SHA, model names, and JSON are supplied as evidence.
- Application/Jiptok segment: a separate **scripted deterministic Mock** recording demonstrating listing UX, photo publishing, proposals and bilateral agreement. It is not represented as real Meta text inference.
- English voiceover: **offline synthetic TTS**, not Meta speech, not a voice of a human deal participant.

This validates model connectivity and example response quality; it does not constitute an end-to-end authenticated production-browser integration test of a real household or two real human accounts. User-provided listing and deal facts require human review.

## Maintenance
- `web/scripts/render-real-meta-demo.py`: deterministic source-hash-verified panel builder.
- `.github/workflows/publish-real-meta-demo.yml`: CI voice/video encoder and GitHub Release uploader.
- The temporary capture-only API route and sandbox workflow have been removed.
- The temporary three Vercel environment variables must be revoked after the cleanup deployment.
