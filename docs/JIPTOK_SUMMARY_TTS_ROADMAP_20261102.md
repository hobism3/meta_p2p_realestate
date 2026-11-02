# Jiptok interaction: human-controlled digest and future speech (2026-11-02)

## Design boundaries
The **neutral Jiptok companion** never negotiates prices or invents terms. It reads actual saved conversations, proposal versions, visit approvals and review status, and presents:
- what each person agreed to in the app (only actual persisted bilateral same-version agreement),
- what is awaiting one or both confirmations,
- what's still being discussed or never checked,
- the single most relevant next human action and a link to the actionable card.

The status digest must not infer legal contract validity, ownership or financial safety. It is a read-only projection. No AI model is called to calculate the status or to create these UI cards. The status list is not a contract.

### UX / accessibility
- Primary takeaway appears before the full checklist and technical history.
- Pending/confirmed are **never color-only**: status text and numeric labels accompany color.
- Long native Korean user-written terms remain unchanged in EN mode to avoid unsafe machine translation of financial amounts or obligations.
- Desktop: side-by-side status cards; mobile: stacked summary with visible primary next-action button.
- Demo/Mock badge remains visible for synthetic example rooms.

## Future optional audio/TTS feature (not implemented at submission)
A natural future interaction is a **user-pressed speaker button** beside Jiptok's digest, not an auto-speaking group-chat bot. The first version can use built-in browser `speechSynthesis` (no model credits), with a locally generated plain-language sentence from already visible summary fields. Speaker output must use the currently selected KR/EN locale; browser voice availability and pronunciation of Korean monetary units require real-device tests.

Requirements before shipping:
1. User explicitly clicks `Listen to summary`; default audio OFF and no automatically played audio when a proposal changes.
2. Read only the short user-visible digest, **not** full private chat messages or document contents by default; add an explicit privacy confirmation for any longer readout.
3. Provide Pause/Stop, accessible label, speech state and reduced-motion/assistive technology support.
4. No background recording, microphone access, cloud TTS upload, or retention of synthesized audio.
5. If later using Meta speech output, protect text and credentials server-side, add opt-in, cost limits, rate limiting, and clearly separate human/AI speech.
6. No synthetic speech may be mistaken for a participant's legally valid consent.

## Acceptance evidence
- Desktop/mobile Playwright verifies real deal card status and a visible neutral summary.
- Live Meta usage remains a separate opt-in pipeline; the status projection is deterministic regardless of model availability.
