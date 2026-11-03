#!/usr/bin/env python3
"""Three-feature kinetic opening, product-first narration, authentic captured UI.

Keeps previous edits intact. No product/API/model calls; narration is supplied
by generate-product-demo-voice.py. Full product frames retain their disclosures.
"""
from __future__ import annotations

import argparse
import importlib.util
import io
import json
import math
from pathlib import Path
import subprocess
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageOps

spec = importlib.util.spec_from_file_location("dynamic", Path(__file__).with_name("render-dynamic-demo.py"))
edit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edit)
W, H, FPS, DURATION = edit.W, edit.H, edit.FPS, edit.DURATION
INK, PAPER, LIME, MUTED = edit.INK, edit.PAPER, edit.LIME, edit.MUTED
WEB = Path(__file__).resolve().parents[1]
OUT = WEB / "demo-artifacts/kinetic-refresh"
UI = WEB / "demo-artifacts/english-refresh/english-source.mp4"
SOURCE = WEB / "demo-artifacts/dynamic/source"
UI_SHA = "9cb7b382da07ec494744b817a038d11aad8d70d589caefedca2ef3cf87143e60"
MASTER = "DirectHome_Kinetic_Editorial_20261103.mp4"
CLEAN = "DirectHome_Kinetic_VoiceOnly_20261103.mp4"

# Production provenance belongs in the dedicated scene label, not the feature copy.
edit.BEATS = [
    (7, "DOCUMENT TO DRAFT", ["Upload.", "Review. Refine."], "An editable starting point.", "Educational sample PDF / Mock extraction"),
    (24, "YOUR LISTING", ["Your details.", "Your decision."], "Check the fields. Add your terms.", "Educational sample PDF / Mock extraction"),
    (34, "PHOTO INTELLIGENCE", ["One photo.", "Useful details."], "Room type and amenity suggestions.", "Recorded Meta output / synthetic source image"),
    (46, "YOU CHOOSE", ["Air conditioner", "identified."], "Review the suggestion. Choose the amenity.", "Recorded Meta output / synthetic source image"),
    (60, "VISUALIZE THE SPACE", ["A fresh", "perspective."], "Compare the original and a furniture-free view.", "Recorded Meta output / AI simulation"),
    (74, "READY TO SAVE", ["Reviewed.", "Then saved."], "The owner chooses when to save.", "Fictional listing / recorded product UI"),
    (79, "MEET JIPTOK", ["Talk naturally.", "Stay aligned."], "Proposals, confirmations and open questions.", "Synthetic participants / Mock AI"),
    (96, "THE SAME PROPOSAL", ["Same terms.", "Same version."], "Both participants review the proposal.", "Synthetic participants / Mock AI"),
    (103, "ONE CONFIRMATION", ["One yes.", "One pending."], "The owner still needs to confirm.", "Synthetic participants / Mock AI"),
    (114, "BOTH CONFIRMED", ["Two people.", "One version."], "In-app confirmation. Not a signed contract.", "Synthetic participants / Mock AI"),
    (124, "FOLLOW THE SOURCE", ["Open the", "record."], "Read the document in your browser.", "Educational sample PDF / browser-local extraction"),
    (141, "COMPARE & SELECT", ["Read. Compare.", "Follow up."], "Select candidate entries for further review.", "Educational sample PDF / browser-local extraction"),
    (157, "YOUR NEXT CHECKS", ["Know what", "to ask next."], "Recorded entries and checks still to complete.", "Review checklist / no legal verification"),
]
TITLES = [
    (7, "One document. A head start."), (24, "Review it. Make it yours."),
    (34, "One photo. Useful suggestions."), (46, "See it. Choose it."),
    (60, "Imagine the space."), (74, "Review. Save. Move forward."),
    (79, "From conversation to clear terms."), (96, "Same terms. Same version."),
    (103, "One yes. One pending."), (114, "Two confirmations. One version."),
    (124, "Open the record."), (141, "Read. Compare. Follow up."),
    (157, "Know what to check next."),
]
PREVIEW_TIMES = [.65, 2.65, 4.65, 6.45, 7.8, 18, 34.8, 49, 68, 79.7,
                 94, 102.9, 103.1, 108, 113.9, 114.1, 119, 124.7, 134, 149, 163, 173]
# Hold the last authentic pending frame until its existing English caption changes.
# This is a temporal edit of complete frames; no application text/state is repainted.
SOURCE_HOLDS = [
    {"startFrame": 3014, "endFrame": 3090, "sourceFrame": 3013,
     "start": 3014/30, "end": 103, "reason": "Align visitor confirmation with recorded English panel and editorial rail"},
    {"startFrame": 3383, "endFrame": 3420, "sourceFrame": 3382,
     "start": 3383/30, "end": 114, "reason": "Hold before premature bottom caption; align bilateral confirmation, translation panel and rail"},
]


class KineticDesigner(edit.Designer):
    def __init__(self, source, ui, ff):
        super().__init__(source)
        self.feature_frames = [edit.still(ff, ui, t) for t in [18, 94, 134]]
        self.frame_holds = []
        for hold in SOURCE_HOLDS:
            data = subprocess.check_output([ff, "-v", "error", "-i", str(ui), "-vf",
                    f"select=eq(n\\,{hold['sourceFrame']})", "-fps_mode", "passthrough", "-frames:v", "1",
                    "-f", "image2pipe", "-vcodec", "png", "-"])
            self.frame_holds.append((hold, Image.open(io.BytesIO(data)).convert("RGB")))
        self.validate_layout()

    def validate_layout(self):
        d = ImageDraw.Draw(Image.new("RGB", (W, H)))
        for _, title in TITLES:
            assert d.textlength(title, font=edit.font(66, 800)) < 1790, title
        for lines in [("LIST", "SMARTER."), ("AGREE", "CLEARLY."), ("CHECK", "THE RECORD.")]:
            for line in lines:
                assert d.textlength(line, font=edit.font(112 if len(line)>9 else 146, 800)) < 1000, line

    def intro(self, t):
        if t >= 5.8:
            return self.intro_resolve(t)
        i = min(int(t/2), 2)
        local = t-i*2
        background = [INK, PAPER, LIME][i]
        fg = PAPER if i == 0 else INK
        secondary = "#B9C7BA" if i == 0 else MUTED
        im = Image.new("RGB", (W, H), background)
        d = ImageDraw.Draw(im)
        edit.header(im, t, i == 0)
        # Strong grid, oversized numbers, two-word vertical reveals, three hard cuts.
        edit.text(d, (64, 165), f"0{i+1}  /  THREE WAYS TO MOVE FORWARD", 22, secondary, 800)
        lines = [("LIST", "SMARTER."), ("AGREE", "CLEARLY."), ("CHECK", "THE RECORD.")][i]
        for j, line in enumerate(lines):
            p = edit.ease((local-.06-j*.12)/.38)
            if p:
                size = 112 if len(line)>9 else 146
                edit.text(d, (56+round(110*(1-p)), 303+j*174+round(55*(1-p))), line, size,
                          LIME if i==0 and j==1 else fg, 800)
        descriptions = ["A document. A photo. Your listing.",
                        "Jiptok keeps the next decision clear.",
                        "Read the source. Plan the next checks."]
        edit.text(d, (65, 737), descriptions[i], 30, secondary, 600)
        # Authentic full UI preview, set apart from the detailed walkthrough that follows.
        x = 1060+round(75*(1-edit.ease(local/.42)))
        y = 316
        d.rounded_rectangle((x-16, y-50, x+795, y+458), radius=20, fill="#34453B" if i==0 else "#E0E5D8")
        edit.text(d, (x+8, y-34), ["SMART LISTING", "JIPTOK / SHARED TERMS", "REGISTRY REVIEW"][i], 18, fg if i==0 else INK, 800)
        pic = self.feature_frames[i].resize((780, 439), Image.Resampling.LANCZOS)
        im.paste(pic, (x, y))
        d = ImageDraw.Draw(im)
        edit.text(d, (1060, 808), "RECORDED PRODUCT PREVIEW", 17, secondary, 700)
        labels = ["Educational sample PDF / Mock extraction",
                  "Synthetic participants / Mock AI",
                  "Educational sample PDF / browser-local extraction"]
        edit.paragraph(d, (1060, 845), labels[i], 20, 760, secondary, 8)
        for n, label in enumerate(["LIST", "AGREE", "REVIEW"]):
            xx = 66+n*280
            d.rectangle((xx, 953, xx+244, 959), fill=(fg if n<=i else secondary))
            edit.text(d, (xx, 980), f"0{n+1}  {label}", 20, fg if n==i else secondary, 800)
        # Short impact underline extends on each feature's first beat.
        d.rectangle((66, 682, 66+round(810*edit.ease(local/.34)), 690), fill=LIME if i==0 else INK)
        return im

    def intro_resolve(self, t):
        im = Image.new("RGB", (W, H), INK)
        d = ImageDraw.Draw(im)
        edit.header(im, t, True)
        for i, name in enumerate(["LIST", "AGREE", "REVIEW"]):
            p = edit.ease((t-5.8-i*.065)/.28)
            x = 66+i*610
            edit.text(d, (x, 276+round(40*(1-p))), f"0{i+1}", 35, LIME, 700)
            edit.text(d, (x-5, 365+round(65*(1-p))), name, 108, PAPER, 800)
            d.line((x, 530, x+535, 530), fill="#53644F", width=2)
        edit.text(d, (60, 661), "DirectHome", 140, LIME, 800)
        edit.text(d, (68, 868), "Three connected steps. People in control.", 36, "#C2CDC1", 500)
        edit.text(d, (68, 1005), "SMART LISTING   /   JIPTOK   /   REGISTRY REVIEW", 22, PAPER, 700)
        return im

    def product(self, t, frame):
        im = super().product(t, frame)
        # Animate only the editorial title area. The captured UI stays readable.
        d = ImageDraw.Draw(im)
        d.rectangle((0, 104, W, 237), fill=PAPER)
        start, title = next(pair for pair in reversed(TITLES) if t >= pair[0])
        x = 60
        for i, word in enumerate(title.split()):
            p = edit.ease((t-start-.04*i)/.35)
            if p:
                edit.text(d, (x, 125+round(29*(1-p))), word, 66, INK, 800)
            x += int(d.textlength(word+" ", font=edit.font(66, 800)))
        edit.text(d, (64, 211), "THE PRODUCT, IN ACTION", 16, MUTED, 700)
        edit.text(d, (1218, 211), "RECORDED WALKTHROUGH", 16, MUTED, 600)
        if 124 <= t < 169:
            # User selection remains a review action, not a verified legal fact.
            d.rectangle((1563, 836, 1860, 878), fill=PAPER)
            edit.text(d, (1568, 841), "Build the review checklist", 17, INK, 600)
        return im

    def comparison(self, t):
        im = super().comparison(t)
        d = ImageDraw.Draw(im)
        d.rectangle((60, 218, 1850, 252), fill=INK)
        edit.text(d, (64, 225), "MUSE IMAGE  /  ORIGINAL + FURNITURE-FREE PREVIEW", 20, "#B8C6B6", 700)
        edit.text(d, (1395, 988), "Recorded Meta output", 21, "#C2CDC1", 700)
        return im

    def transition(self, t, start, number, word, subtitle):
        im = Image.new("RGB", (W, H), LIME if number=="03" else INK)
        dark = number=="02"
        fg, muted = (PAPER, "#C2CDC1") if dark else (INK, MUTED)
        d = ImageDraw.Draw(im)
        edit.header(im, t, dark)
        edit.text(d, (68, 176), f"FEATURE {number}", 26, LIME if dark else INK, 800)
        words = ["AGREE", "CLEARLY."] if dark else ["CHECK", "THE RECORD."]
        for i, line in enumerate(words):
            p = edit.ease((t-start-i*.1)/.34)
            edit.text(d, (55+round(120*(1-p)), 310+i*190), line, 152, fg, 800)
        edit.text(d, (68, 791), "Jiptok / same terms, same version" if dark else "Registry review / read, compare, follow up", 36, muted, 600)
        d.rectangle((70, 709, 70+round(1500*edit.ease((t-start)/.42)), 718), fill=LIME if dark else INK)
        edit.text(d, (68, 1002), "DIRECTHOME   /   PEOPLE IN CONTROL", 22, muted, 700)
        return im

    def outro(self, t):
        im = Image.new("RGB", (W, H), INK)
        d = ImageDraw.Draw(im)
        edit.header(im, t, True)
        for i, line in enumerate(["LIST SMARTER.", "AGREE CLEARLY.", "CHECK THE RECORD."]):
            p = edit.ease((t-169-i*.18)/.4)
            edit.text(d, (62, 242+i*155+round(36*(1-p))), line, 92, LIME if i==2 else PAPER, 800)
        edit.text(d, (68, 770), "Clearer information. Shared decisions.", 42, PAPER, 500)
        edit.text(d, (68, 843), "People in control.", 42, LIME, 800)
        edit.text(d, (68, 1005), "meta-p2p-realestate.vercel.app", 25, "#C2CDC1", 500)
        edit.text(d, (1190, 916), "HACKATHON PROTOTYPE", 18, LIME, 800)
        edit.text(d, (1190, 955), "Synthetic data / recorded Meta output", 19, "#C2CDC1", 500)
        edit.text(d, (1190, 992), "Review support / no legal certification", 19, "#C2CDC1", 500)
        return im

    def frame(self, t, source_frame):
        for hold, still in self.frame_holds:
            if hold["startFrame"] <= round(t*FPS) < hold["endFrame"]:
                source_frame = still
                break
        return super().frame(t, source_frame)


def score(path):
    """Original 120 BPM score and timed accents; no downloaded samples."""
    sr = 48000
    n = sr*DURATION
    music = np.zeros((n, 2), dtype=np.float32)
    rng = np.random.default_rng(20261104)

    def put(audio, start, gain, pan=0):
        k = round(start*sr)
        if k < 0 or k>=n:
            return
        a = audio[:n-k]*gain
        music[k:k+len(a), 0] += a*math.sqrt((1-pan)/2)
        music[k:k+len(a), 1] += a*math.sqrt((1+pan)/2)

    chords = [(130.81, 164.81, 196, 293.66), (110, 130.81, 164.81, 246.94),
              (87.31, 130.81, 174.61, 220), (98, 146.83, 196, 246.94)]
    for bar in range(math.ceil(DURATION/2)):
        start = bar*2
        chord = chords[(bar//2)%4]
        tt = np.arange(2*sr)/sr
        env = np.minimum(tt/.2, 1)*np.minimum((tt[-1]-tt)/.5, 1)
        pad = sum(np.sin(2*np.pi*f*tt) for f in chord)/4
        put(pad*env, start, .016)
        for j in range(4):
            tt = np.arange(round(.55*sr))/sr
            f = chord[j]*2
            put((np.sin(2*np.pi*f*tt)+.18*np.sin(4*np.pi*f*tt))*np.exp(-tt*9)*np.minimum(tt/.009, 1),
                start+j*.5, .024, -.5 if j%2 else .5)
        for j in [0, 2]:
            tt = np.arange(round(.20*sr))/sr
            put(np.sin(2*np.pi*(46*tt+1.4*(1-np.exp(-tt/.035))))*np.exp(-tt*24), start+j*.5, .045)
        for j in range(8):
            tt = np.arange(round(.035*sr))/sr
            noise = rng.normal(0, 1, len(tt))
            put(np.r_[0, np.diff(noise)]*np.exp(-tt*130), start+j*.25, .0025, .3)
    for start in [0, 2, 4, 5.8, 7, 34, 60, 79, 103, 114, 124, 141, 169]:
        tt = np.arange(round(.25*sr))/sr
        put(np.sin(2*np.pi*(68*tt+2*(1-np.exp(-tt/.02))))*np.exp(-tt*24), start, .07)
        tt = np.arange(round(.30*sr))/sr
        put(np.sin(2*np.pi*659.25*tt)*np.exp(-tt*15)*np.minimum(tt/.008, 1), start, .027, .2)
    fade = np.minimum(np.arange(n)/(sr*.025), 1)*np.minimum(np.arange(n)[::-1]/(sr*1.5), 1)
    music *= fade[:, None]
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes((np.clip(music, -1, 1)*32767).astype("<i2").tobytes())


def mix(voice, out, ff):
    score(out/"original-kinetic-score.wav")
    target, clean = out/MASTER, out/CLEAN
    filters = ("[1:a]aresample=48000,asplit=2[voice][key];[2:a]volume=0.55[score];"
               "[score][key]sidechaincompress=threshold=0.015:ratio=6:attack=8:release=240[bed];"
               "[voice][bed]amix=inputs=2:normalize=0,alimiter=limit=0.94:level=false:latency=true[mix]")
    edit.run([ff, "-v", "error", "-y", "-i", out/"picture.mp4", "-i", voice,
              "-i", out/"original-kinetic-score.wav", "-filter_complex", filters,
              "-map", "0:v:0", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
              "-t", DURATION, "-movflags", "+faststart", target])
    edit.run([ff, "-v", "error", "-y", "-i", out/"picture.mp4", "-i", voice,
              "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-t", DURATION,
              "-movflags", "+faststart", clean])
    return target, clean


def previews(design, ui, out, ff):
    sheet = Image.new("RGB", (1440, math.ceil(len(PREVIEW_TIMES)/3)*300), PAPER)
    for i, t in enumerate(PREVIEW_TIMES):
        im = design.frame(t, edit.still(ff, ui, t))
        im.save(out/f"preview-{t:05.2f}.jpg", quality=95)
        x, y = i%3*480, i//3*300
        sheet.paste(im.resize((480, 270), Image.Resampling.LANCZOS), (x,y+30))
        edit.text(ImageDraw.Draw(sheet), (x+10,y+6), f"{t:g} s / PREVIEW", 16)
    sheet.save(out/"storyboard.jpg", quality=95)
    design.intro_resolve(6.7).save(out/"DirectHome_Kinetic_Poster.jpg", quality=96)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--preview-only", action="store_true")
    p.add_argument("--audio-only", action="store_true")
    p.add_argument("--picture-only", action="store_true")
    a = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    hashes = edit.prepare(SOURCE, False)
    assert edit.sha(UI)==UI_SHA, "English UI source changed"
    voice = OUT/"voice/narration.m4a"
    if not a.preview_only and not a.picture_only and not voice.is_file():
        p.error("Synthesize revised narration first; expected voice/narration.m4a")
    if not a.audio_only:
        design = KineticDesigner(SOURCE, UI, ff)
        previews(design, UI, OUT, ff)
        if a.preview_only:
            print("KINETIC_PREVIEW_OK", OUT/"storyboard.jpg", flush=True)
            return
        # Reuse streaming compositor, but mix only the supplied revised narration.
        edit.mix_versions = (lambda *args: (None, None)) if a.picture_only else mix
        target, clean = edit.render(design, voice, OUT, ff, UI)
        if a.picture_only:
            (OUT/"picture-manifest.json").write_text(json.dumps({"sha256": edit.sha(OUT/"picture.mp4"),
                "rendererSha256": edit.sha(Path(__file__)), "uiSha256": UI_SHA}, indent=2), encoding="utf-8")
            print("KINETIC_PICTURE_OK", OUT/"picture.mp4", flush=True)
            return
    else:
        previous = json.loads((OUT/"picture-manifest.json").read_text(encoding="utf-8"))
        assert edit.sha(OUT/"picture.mp4")==previous["sha256"], "Picture checksum mismatch"
        assert edit.sha(Path(__file__))==previous["rendererSha256"], "Renderer changed since picture render"
        target, clean = mix(voice, OUT, ff)
    manifest = {"schema": "directhome-kinetic-v1", "durationSeconds": DURATION, "fps": FPS,
                "width": W, "height": H, "sourceSha256": hashes,
                "freshUiSource": {"path": str(UI), "sha256": UI_SHA},
                "narration": {"path": str(voice), "sha256": edit.sha(voice),
                              "description": "New product-first English narration, local Kokoro af_heart"},
                "outputs": {target.name: edit.sha(target), clean.name: edit.sha(clean)},
                "pictureSha256": edit.sha(OUT/"picture.mp4"),
                "rendererSha256": edit.sha(Path(__file__)),
                "opening": [{"start": 0, "feature": "Smart listing"}, {"start": 2, "feature": "Jiptok"},
                            {"start": 4, "feature": "Registry review"}, {"start": 5.8, "feature": "DirectHome recap"}],
                "music": "Original 120 BPM synthesis; timed type accents; no external samples",
                "masterAudio": "New narration at source level; score gain0.55, voice-sidechain ducking",
                "voiceOnlyAudio": "New narration AAC copied unchanged",
                "editorialGraphics": "Post-production typography; all product shots are actual recorded UI",
                "newMetaCalls": 0, "confirmationCaptionChanges": [103, 114]}
    manifest["sourceFrameHolds"] = SOURCE_HOLDS
    (OUT/"edit-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf-8")
    print("KINETIC_RENDER_OK", target, flush=True)


if __name__=="__main__":
    main()
