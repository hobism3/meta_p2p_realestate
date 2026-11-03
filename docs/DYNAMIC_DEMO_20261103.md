# DirectHome — Dynamic editorial demo

This is the archived first editorial cut. The current submission is the
[kinetic edition](ENGLISH_DEMO_REFRESH_20261103.md), with new narration and
corrected Jiptok caption timing. Unchanged-audio and timing-limit statements
below apply only to this historical version.

A new local edit of the existing 2:55 English demo. The film pairs the recorded
product walkthrough with cream/charcoal/lime art direction, Manrope typography,
kinetic opening titles, animated chapter cards, a large before/after photo wipe,
and confirmation-state graphics. A quiet, original 108 BPM instrumental sits
under the original Kokoro narration, with sidechain ducking and soft transitions.

## Deliverables

Generated under `web/demo-artifacts/dynamic/` (ignored by Git):

- `DirectHome_Dynamic_Editorial_20261103.mp4`: main cut with music; 1920×1080,
  30 fps, 175 seconds, H.264/AAC, progressive download (`faststart`).
- `DirectHome_Dynamic_VoiceOnly_20261103.mp4`: same picture, original narration
  AAC stream copied from the source; no added score.
- `DirectHome_Dynamic_Poster.jpg`: opening artwork.
- `storyboard.jpg`: compositor previews.
- `encoded-contact-sheet.jpg` and `qa-frames/`: frames decoded from the final MP4.
- `edit-manifest.json`: source/output checksums and editorial provenance.
- `validation.json`: encoded-file acceptance results.

These are local deliverables, not published GitHub Release assets. The previous
public submission film remains available and is not overwritten.

## Edit decisions

| Time | Treatment |
| --- | --- |
| 0–7s | Large staggered type, slow image push, three-part journey |
| 7–79s | Complete recorded listing UI, chapter progress, changing editorial notes |
| 64–73s | Enlarged original/edited room comparison with moving reveal |
| 79–80.5s | Animated “Agree clearly” chapter card |
| 79–124s | Jiptok UI and original English translation, additional status rail |
| 103s / 114s | One-confirmed / both-confirmed graphics, matching burned-in captions |
| 124–125.5s | Animated “Look closer” chapter card |
| 124–169s | Full fictional-PDF rights-review recording and source labels |
| 169–175s | Closing statement and product URL |

All added typography, the browser mat, confirmation rail and comparison wipe are
**editorial graphics**, not newly implemented product capabilities. The full
16:9 recording remains uncropped in walkthrough scenes, including its source
labels, educational PDF inset and English translation. Source footage is 720p;
the new titles and composition render at 1080p, without claiming new detail in
the original recording. Brief chapter cards and the comparison are intentional
cutaways; they do not replace the recorded confirmation actions.

The source's 175-second voice timing is unchanged. The music master lifts the
quiet source voice by 6.85 dB and lowers the synthesized score by 3.10 dB before
ducking. It is remixed and AAC-encoded; only the separate voice-only edition
claims bit-identical audio.

## Rebuild

Python 3.12 was used. Commands work from the repository root on Windows or Linux;
FFmpeg is supplied by `imageio-ffmpeg`, and the licensed font is bundled.

```powershell
python -m pip install -r web/scripts/requirements-video.txt
python web/scripts/render-dynamic-demo.py --fetch-source
python web/scripts/validate-dynamic-demo.py
```

`--fetch-source` downloads three checksum-pinned inputs from the existing
`directhome-three-chapter-demo-20261103` release. Existing matching local files
are reused. A checksum mismatch stops the build. `--preview-only` creates the
storyboard without rendering the movie. `--output-dir PATH` changes the working
and output directory; use the same path when validating.
`--audio-only` remixes a completed, checksum-verified `picture.mp4` without
re-encoding the picture, then updates the output manifest.

The renderer writes progress and exits nonzero if an input is absent, altered,
truncated, or FFmpeg fails. Render intermediates stay local for inspection.

## Source and asset rights

- Source film: `DirectHome_3Chapters_Kokoro_English_Chat_Captions_20261103.mp4`,
  SHA-256 `3537e1b20eee944ab693e2c4b655424dbb36788c5201bfc9a37799f8ba9634aa`.
- Room photograph and empty-room image: previously captured genuine Meta outputs
  from the same public release, verified against project-documented hashes.
  The room is synthetic. The empty-room rendering is an AI simulation, never
  evidence of actual property condition or hidden surfaces.
- Registration draft and participants remain fictional/Mock; registry rights
  extraction is local and deterministic. No title certification, signing,
  real-person transaction or fresh Meta invocation is implied.
- Manrope font: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/manrope),
  SIL Open Font License 1.1, included at `web/scripts/video-assets/OFL.txt`.
  Font SHA-256: `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6`.
- Music and transition sounds: deterministic NumPy synthesis in the renderer,
  seed `20261103`, with no recordings, samples, external tracks or generative
  music service. No new model or TTS calls occur.
- Original educational document and Kokoro narration provenance remain as
  documented in [the prior submission cut](FINAL_SUBMISSION_CUT_20261103.md).

## Validation record

- `npm run build`: exit 0, isolated local SQLite path and Mock provider.
- All `web/tests/*.test.mjs`: **707 passed, 0 failed**, exit 0, Node 24.12.0,
  concurrency 2. Production database and external model calls were not used.
- Baseline setup: `npm ci` rejected the existing lockfile because optional
  `@napi-rs/canvas` entries are missing. `npm install --package-lock=false`
  succeeded; package manifests/lockfile were not changed for this video task.
  Windows Node does not accept `tests/` as a test entry; enumerating the `.mjs`
  test files resolved that invocation issue.
- Independent read-only QA reviewed composition, evidence fidelity, text fit,
  source hashes, font license and 103/114-second state changes. The review's
  copy correction (“OWNER IN CONTROL”) was applied before the final render.
- Local smoke: `/`, `/showcase`, `/api/health` all returned HTTP 200, exit 0.
- Both final MP4s: full decode with `-xerror`, exit 0; **175.000 seconds,
  5,250 frames, 1920×1080, 30 fps, H.264 yuv420p/AAC, faststart**.
- Music master: **−18.8 LUFS integrated, −4.0 dBFS true peak**, 15,091,008 bytes.
  Narration's minimum five-second waveform correlation with the original is
  **0.99646**, with no timing shift detected. This measures signal preservation,
  not a claim of subjective listening evaluation.
- Voice-only: **−25.6 LUFS, −10.8 dBFS true peak**, 13,353,264 bytes;
  compressed AAC checksum is **identical** to the original source.
- The first audio mix failed the 0.97 correlation gate at 110–115s (0.96479).
  Diagnosis found zero lag but too much score relative to quiet speech. Raising
  narration and reducing the score fixed it; the threshold was not relaxed.
- Nineteen decoded final frames include both sides of the 103s/114s status
  changes, photo transitions, source document and closing card. Final encoded
  frames were visually reviewed for clipping and accurate captions.
- Known source timing limitation: at 113.9s, the recorded product UI already
  shows both confirmed, while its pre-existing burned-in English caption and
  the new rail still show owner pending until 114s; the 114.1s sample aligns.
  The precise onset of this inherited caption lag was not measured. This edit
  follows the released English-caption timing and does not retime the source UI.

The validator fully decodes both deliverables, checks duration/frame count,
H.264/AAC, pixel format, dimensions, frame rate and faststart, measures true
peak/loudness, compares the voice-only compressed AAC with the original, and
checks narration correlation in five-second windows in the music master.
