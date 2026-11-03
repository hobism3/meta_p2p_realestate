# Offline English Narration — Kokoro Alternative (2026-11-03)

The default DirectHome three-chapter demo is a **175-second application walkthrough**. It has a natural synthetic English voice throughout and does not add speech playback inside Jiptok.

For clearer asset rights ahead of hackathon submission, a separate edition replaces the speech stems with **Kokoro-82M v1.0**, the Apache-2.0 open-weight speech model at https://huggingface.co/hexgrad/Kokoro-82M, using the `af_heart` speaker preset and a local ONNX runner (https://github.com/thewh1teagle/kokoro-onnx). All 15 segments are synthesized locally; no speech API or paid model account is called.

- Video version: `DirectHome_Three_Chapters_Kokoro_OpenWeight_20261103.mp4` in the same public [GitHub Release](https://github.com/hobism3/meta_p2p_realestate/releases/tag/directhome-three-chapter-demo-20261103).
- Source text/timing: `web/scripts/generate-natural-demo-voice.py`, artifact `voice-cues.json`.
- Source run: GitHub Actions `directhome-licensed-offline-neural-voice` run `41549929118`, producing 15 MP3s from ONNX outputs.
- Video reconstruction: `.github/workflows/publish-kokoro-hackathon-demo.yml` and `web/scripts/assemble-three-chapter-demo.py`.
- The rendered MP4 includes the same source-verified existing Meta image outputs **replayed in the product UI**, the same fictional educational rights PDF for registration and review, and synthetic Jiptok participants.
- The ONNX model binary and voice pack are fetched temporarily in CI and never committed or redistributed. No user or third-party copyrighted voice was cloned. The source code retains license links; review applicable open-weight license and competition terms before any commercial publishing.

The old video made using the separate Edge TTS playback engine may be retained for a side-by-side quality comparison, but the **Kokoro edition** offers a clearer, documented open-weight voice provenance for hackathon asset review.
