#!/usr/bin/env python3
"""DirectHome motion edit: authentic captured UI, original graphics and score.

Run from any directory. Downloads are opt-in; renders never call a model or TTS.
The 175-second Kokoro narration stays at its original timing. Editorial overlays
are outside the uncropped product recording. See docs/DYNAMIC_DEMO_20261103.md.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import urllib.request
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

WEB = Path(__file__).resolve().parents[1]
DEFAULT = WEB / "demo-artifacts/dynamic"
FONT = Path(__file__).parent / "video-assets/Manrope.ttf"
RELEASE = "https://github.com/hobism3/meta_p2p_realestate/releases/download/directhome-three-chapter-demo-20261103/"
MOVIE = "DirectHome_3Chapters_Kokoro_English_Chat_Captions_20261103.mp4"
ASSETS = {
    MOVIE: "3537e1b20eee944ab693e2c4b655424dbb36788c5201bfc9a37799f8ba9634aa",
    "source_meta_generated.jpg": "af59759ed94169864d77587608dcc8f88e87b74f75f591351a06f883390a47c5",
    "empty_view_actual.webp": "23fdd7e442487566dc05052b94aad69065bec2aaba40e9ae3919b15bdf221ded",
}
W, H, FPS, DURATION = 1920, 1080, 30, 175
PAPER, INK, MUTED, LINE, LIME = "#F1F0E9", "#192A27", "#65736A", "#D7DBD0", "#D4F77D"
CHAPTERS = [(7, 79, "01", "LIST", "Less paperwork. More possibility."),
            (79, 124, "02", "AGREE", "Talk naturally. Agree clearly."),
            (124, 169, "03", "REVIEW", "Clarity starts with better questions.")]
BEATS = [
    (7, "FROM PDF TO DRAFT", ["Start with", "what you have."], "An editable starting point.", "Fictional registry / Mock extraction"),
    (24, "REVIEW & REFINE", ["Your details.", "Your decision."], "Review every field before saving.", "Fictional registry / Mock extraction"),
    (34, "PHOTO INTELLIGENCE", ["One photo.", "More context."], "Recorded Meta Muse Spark response.", "Genuine Meta output / replayed"),
    (46, "A VISIBLE DETAIL", ["Air conditioner", "identified."], "An amenity suggestion. The owner chooses.", "Genuine Meta output / replayed"),
    (60, "REIMAGINE THE SPACE", ["See the", "possibilities."], "Recorded Muse Image furniture-removal edit.", "AI simulation / not property evidence"),
    (74, "READY TO SAVE", ["Reviewed.", "Then saved."], "The owner confirms the listing.", "Fictional listing / recorded product UI"),
    (79, "MEET JIPTOK", ["A conversation,", "with clarity."], "A neutral companion for the next step.", "Synthetic participants / Mock AI"),
    (96, "THE SAME PROPOSAL", ["Clear terms.", "Shared context."], "A proposal is not an agreement.", "Synthetic participants / Mock AI"),
    (103, "ONE CONFIRMATION", ["One yes.", "One pending."], "The owner still needs to confirm.", "Synthetic participants / Mock AI"),
    (114, "BOTH CONFIRMED", ["Two people.", "One version."], "In-app acknowledgments, not a signed contract.", "Synthetic participants / Mock AI"),
    (124, "FOLLOW THE SOURCE", ["Read locally.", "Review carefully."], "The same fictional PDF, processed in-browser.", "Fictional PDF / local deterministic check"),
    (141, "EVIDENCE, NOT ASSUMPTIONS", ["Find a record.", "Check the source."], "Candidates stay unverified until reviewed.", "Fictional PDF / local deterministic check"),
    (157, "KNOW WHAT TO ASK", ["Better questions.", "Clearer next steps."], "Liens, prior tenants, taxes and signing authority.", "Educational review / no safety certification"),
]


def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, **kwargs)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clamp(v):
    return min(1.0, max(0.0, v))


def ease(v):
    return 1 - (1 - clamp(v)) ** 3


@lru_cache(maxsize=160)
def font(size, weight=600):
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_axes([weight])
    return f


def text(d, xy, label, size=24, color=INK, weight=600):
    d.text(xy, label, font=font(size, weight), fill=color, anchor="lt")


def paragraph(d, xy, label, size=25, width=320, color=MUTED, spacing=12):
    x, y = xy
    line = ""
    for word in label.split():
        candidate = (line + " " + word).strip()
        if line and d.textlength(candidate, font=font(size)) > width:
            text(d, (x, y), line, size, color)
            y += size + spacing
            line = word
        else:
            line = candidate
    if line:
        text(d, (x, y), line, size, color)
    return y + size + spacing


def pill(d, xy, label, dark=False, size=19):
    x, y = xy
    w = int(d.textlength(label, font=font(size, 700))) + 38
    d.rounded_rectangle((x, y, x+w, y+42), radius=21, fill=INK if dark else LIME)
    text(d, (x+19, y+11), label, size, PAPER if dark else INK, 700)
    return w


def house(d, x, y, size=34, color=INK):
    d.line([(x, y+size*.42), (x+size*.5, y), (x+size, y+size*.42)], fill=color, width=4)
    d.line([(x+size*.17, y+size*.38), (x+size*.17, y+size),
            (x+size*.83, y+size), (x+size*.83, y+size*.38)], fill=color, width=4)


def arrow(d, x, y, size=50, color=INK):
    d.line([(x, y+size), (x+size, y)], fill=color, width=5)
    d.line([(x+size*.25, y), (x+size, y), (x+size, y+size*.75)], fill=color, width=5)


@lru_cache(maxsize=12)
def mask(w, h, radius):
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w-1, h-1), radius=radius, fill=255)
    return im


def rounded_paste(canvas, im, xy, radius=20):
    canvas.paste(im, (int(xy[0]), int(xy[1])), mask(*im.size, radius))


def header(im, t, dark=False):
    d = ImageDraw.Draw(im)
    color = PAPER if dark else INK
    house(d, 62, 42, color=color)
    text(d, (113, 40), "DirectHome", 30, color, 800)
    text(d, (346, 49), "A CLEARER WAY HOME", 16, LIME if dark else MUTED, 700)
    for i, (_, _, num, name, _) in enumerate(CHAPTERS):
        x = 1270 + i * 196
        active = (7 <= t < 79 and i == 0) or (79 <= t < 124 and i == 1) or (124 <= t < 169 and i == 2)
        if active:
            d.rounded_rectangle((x-16, 31, x+164, 82), radius=26, fill=LIME)
        text(d, (x, 46), f"{num}  {name}", 20, INK if active else color, 700)
    d.line((62, 101, 1858, 101), fill="#41504A" if dark else LINE, width=1)


def chapter(t):
    return next((c for c in CHAPTERS if c[0] <= t < c[1]), CHAPTERS[-1])


def beat(t):
    return next(b for b in reversed(BEATS) if t >= b[0])


class Designer:
    def __init__(self, source):
        self.original = Image.open(source / "source_meta_generated.jpg").convert("RGB")
        self.edited = Image.open(source / "empty_view_actual.webp").convert("RGB")
        self.hero = ImageOps.fit(self.original, (860, 914), Image.Resampling.LANCZOS)
        self.compare_original = ImageOps.fit(self.original, (1264, 748), Image.Resampling.LANCZOS)
        self.compare_edited = ImageOps.fit(self.edited, (1264, 748), Image.Resampling.LANCZOS)

    def intro(self, t):
        im = Image.new("RGB", (W, H), INK)
        d = ImageDraw.Draw(im)
        # Slow geometry and image motion under staggered, upward word reveals.
        for j in range(5):
            x = -780 + j*144 + t*7
            d.arc((x, 180, x+1500, 1680), 205, 355, fill="#2F423B", width=2)
        y = 130 + round((1-ease(t/1.1))*120)
        zoom = 1.035 - .025*clamp(t/7)
        pic = self.hero.resize((round(860*zoom), round(914*zoom)), Image.Resampling.BICUBIC)
        dx, dy = (pic.width-860)//2, (pic.height-914)//2
        pic = pic.crop((dx, dy, dx+860, dy+914))
        rounded_paste(im, pic, (998, y), 28)
        d = ImageDraw.Draw(im)
        header(im, t, True)
        pill(d, (66, 169), "LESS FRICTION. MORE CLARITY.")
        for i, word in enumerate(["Your next", "chapter,", "made clear."]):
            p = ease((t-.3-i*.16)/.8)
            if p > 0:
                text(d, (58, 306+i*149+round(60*(1-p))), word, 126,
                     LIME if i == 2 else PAPER, 800)
        if t > 1.1:
            text(d, (66, 813), "From a listing to a shared next step.", 32, "#C2CDC1", 500)
        for i, label in enumerate(["01  LIST", "02  AGREE", "03  REVIEW"]):
            if t > 1.7+i*.2:
                pill(d, (66+i*278, 945), label, size=22)
        pill(d, (1040, 939), "ACTUAL META OUTPUT / SYNTHETIC ROOM", True, 16)
        d.ellipse((1738, 158, 1826, 246), fill=LIME)
        arrow(d, 1762, 182, 38)
        return im

    def product(self, t, frame):
        im = Image.new("RGB", (W, H), PAPER)
        header(im, t)
        d = ImageDraw.Draw(im)
        start, end, number, name, title = chapter(t)
        text(d, (60, 125), title, 66, INK, 800)
        text(d, (64, 208), "THE PRODUCT, IN ACTION", 16, MUTED, 700)
        text(d, (1218, 208), "RECORDED WALKTHROUGH", 16, MUTED, 600)
        # Entire 16:9 source, including original captions and evidence labels.
        # A short entrance translates the whole frame; it never crops the content.
        enter = ease((t-start)/.8)
        y = 272 + round(22*(1-enter))
        d.rounded_rectangle((60, y-32, 1492, y+774), radius=18, fill="#DFE4D8")
        for i, c in enumerate(["#C3CABC", "#ABB7A1", "#92A78B"]):
            d.ellipse((80+22*i, y-21, 90+22*i, y-11), fill=c)
        text(d, (664, y-25), "directhome / product demo", 13, MUTED)
        # Source aspect is kept exactly: 1376 x 774, centred inside the browser mat.
        picture = frame.resize((1376, 774), Image.Resampling.BICUBIC)
        im.paste(picture, (88, y))
        d = ImageDraw.Draw(im)
        bstart, kicker, lines, body, source = beat(t)
        drift = round(18*(1-ease((t-bstart)/.65)))
        x = 1534
        text(d, (x-6, 262), number, 136, "#CDD5C5", 500)
        d.line((x, 433, 1856, 433), fill=LINE, width=2)
        text(d, (x, 461+drift), kicker, 15, MUTED, 800)
        yy = 504+drift
        for label in lines:
            text(d, (x, yy), label, 31, INK, 800)
            yy += 45
        paragraph(d, (x, yy+24), body, size=23, width=318, spacing=10)
        if 79 <= t < 124:
            self.agreement(d, t, x, 740)
        elif 7 <= t < 34:
            text(d, (x, 753), "59.84", 67, INK, 700)
            text(d, (x+210, 790), "m²", 25, MUTED)
            text(d, (x, 840), "Editable area from the sample", 17, MUTED)
        elif 34 <= t < 74:
            pill(d, (x, 778), "OWNER IN CONTROL", size=17)
        elif 124 <= t < 169:
            for i, s in enumerate(["Read the document", "Review the candidates", "Carry over checked facts"]):
                d.ellipse((x, 751+i*44, x+22, 773+i*44), fill=LIME)
                text(d, (x+7, 755+i*44), str(i+1), 13, INK, 800)
                text(d, (x+34, 753+i*44), s, 17, INK, 600)
        d.line((x, 929, 1856, 929), fill=LINE, width=2)
        text(d, (x, 948), "ABOUT THIS SCENE", 13, MUTED, 800)
        paragraph(d, (x, 974), source, size=17, width=316, spacing=7)
        # Thin chapter progress occupies only the browser chrome, never UI content.
        progress = clamp((t-start)/(end-start))
        d.rectangle((60, y-3, 60+1432*progress, y-1), fill="#8EAD59")
        if t < 7.6:
            # Cream curtain reveals the first UI frame.
            edge = round(W*ease((t-7)/.6))
            d.rectangle((edge, 103, W, H), fill=PAPER)
        return im

    @staticmethod
    def agreement(d, t, x, y):
        count = 0 if t < 103 else 1 if t < 114 else 2
        for i, label in enumerate(["VISITOR", "OWNER"]):
            xx = x+i*164
            d.rounded_rectangle((xx, y, xx+148, y+93), radius=15,
                                fill=LIME if i < count else "#E1E5DA")
            text(d, (xx+16, y+18), label, 15, MUTED, 700)
            text(d, (xx+16, y+48), "Confirmed" if i < count else "Pending", 18, INK, 800)
        text(d, (x, y+112), f"{count} / 2  ON THE SAME VERSION", 17, MUTED, 700)

    def comparison(self, t):
        im = Image.new("RGB", (W, H), INK)
        header(im, t, True)
        d = ImageDraw.Draw(im)
        text(d, (60, 129), "Same room. A new perspective.", 72, PAPER, 800)
        text(d, (64, 225), "MUSE IMAGE  /  A PREVIOUSLY CAPTURED, GENUINE MODEL OUTPUT", 18, "#B8C6B6", 600)
        p = clamp((t-64)/9)
        split = int(1264*(.86-.72*ease(p/.68)))
        photo = self.compare_edited.copy()
        photo.paste(self.compare_original.crop((0, 0, split, 748)), (0, 0))
        rounded_paste(im, photo, (62, 286), 22)
        d = ImageDraw.Draw(im)
        sx = 62+split
        d.line((sx, 286, sx, 1034), fill=LIME, width=4)
        d.ellipse((sx-25, 633, sx+25, 683), fill=LIME)
        text(d, (sx-16, 647), "< >", 19, INK, 800)
        pill(d, (88, 313), "ORIGINAL / SYNTHETIC", True, 16)
        pill(d, (1032, 313), "META EDIT", False, 16)
        text(d, (1392, 327), "Make space", 54, PAPER, 800)
        text(d, (1392, 394), "for possibility.", 54, LIME, 800)
        paragraph(d, (1395, 514), "Explore a furniture-free view without losing sight of the original.",
                  29, 420, "#C2CDC1", 14)
        d.line((1395, 743, 1855, 743), fill="#41504A", width=2)
        pill(d, (1395, 785), "AI SIMULATION", size=18)
        paragraph(d, (1395, 858), "A virtual illustration. Not evidence of actual property condition or hidden surfaces.",
                  22, 425, "#C2CDC1", 11)
        return im

    def transition(self, t, start, number, word, subtitle):
        im = Image.new("RGB", (W, H), INK)
        d = ImageDraw.Draw(im)
        p = ease((t-start)/.65)
        # Giant outlined rings feel architectural without distracting from the word.
        for i in range(4):
            r = 265+i*100+(t-start)*35
            d.ellipse((1500-r, 650-r, 1500+r, 650+r), outline="#405145", width=2)
        d.rectangle((0, 0, W, 105), fill=INK)
        header(im, t, True)
        text(d, (64, 196), f"CHAPTER {number}", 23, LIME, 700)
        text(d, (52, 360+int(90*(1-p))), word, 204, PAPER, 800)
        text(d, (66, 662), subtitle, 40, "#C2CDC1", 500)
        d.ellipse((1510, 420, 1760, 670), fill=LIME)
        arrow(d, 1587, 497, 95)
        text(d, (66, 994), "DIRECTHOME   /   PEOPLE REMAIN IN CONTROL", 19, "#C2CDC1", 600)
        return im

    def outro(self, t):
        im = Image.new("RGB", (W, H), INK)
        header(im, t, True)
        d = ImageDraw.Draw(im)
        p = ease((t-169)/.75)
        for i, s in enumerate(["AI helps.", "People stay", "in control."]):
            text(d, (58, 249+i*162+round(35*(1-p))), s, 130, LIME if i == 2 else PAPER, 800)
        for i, (a, b) in enumerate([("01 / LIST", "Turn inputs into a draft."),
                                     ("02 / AGREE", "Keep every yes explicit."),
                                     ("03 / REVIEW", "Make the next checks clear.")]):
            y = 272+i*193
            d.line((1170, y-28, 1850, y-28), fill="#41504A", width=2)
            text(d, (1174, y), a, 21, LIME, 800)
            text(d, (1174, y+52), b, 35, PAPER, 600)
        pill(d, (66, 860), "TALK NATURALLY. AGREE CLEARLY.", size=23)
        text(d, (66, 1005), "meta-p2p-realestate.vercel.app", 26, "#C2CDC1", 500)
        text(d, (1174, 934), "HACKATHON PROTOTYPE", 19, LIME, 700)
        text(d, (1174, 976), "Synthetic demo data / recorded Meta results", 20, "#C2CDC1", 500)
        text(d, (1174, 1010), "Not a title certification or contract service", 20, "#C2CDC1", 500)
        return im

    def frame(self, t, source_frame):
        if t < 7:
            return self.intro(t)
        if 64 <= t < 73:
            shot = self.comparison(t)
            # A short dissolve into/out of the editorial comparison, never fake UI.
            a = min(clamp((t-64)/.35), clamp((73-t)/.35))
            return Image.blend(self.product(t, source_frame), shot, a) if a < 1 else shot
        if t >= 169:
            return self.outro(t)
        for start, num, word, subtitle in [(79, "02", "Agree clearly.", "A conversation is just the beginning."),
                                           (124, "03", "Look closer.", "Every next step starts with evidence.")]:
            if start <= t < start+1.5:
                card = self.transition(t, start, num, word, subtitle)
                alpha = min(ease((t-start)/.18), clamp((start+1.5-t)/.35))
                return Image.blend(self.product(t, source_frame), card, alpha)
        return self.product(t, source_frame)


def prepare(source, download):
    source.mkdir(parents=True, exist_ok=True)
    for name, expected in ASSETS.items():
        p = source / name
        if not p.exists() and download:
            print("DOWNLOAD", name, flush=True)
            urllib.request.urlretrieve(RELEASE+name, p)
        if not p.is_file():
            raise RuntimeError(f"Missing {p}. Use --fetch-source to download released evidence.")
        if sha(p) != expected:
            raise RuntimeError(f"Source checksum mismatch: {name}")
    return {name: sha(source/name) for name in ASSETS}


def still(ffmpeg, video, t):
    b = subprocess.check_output([ffmpeg, "-v", "error", "-ss", str(t), "-i", str(video),
                                 "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"])
    return Image.open(io.BytesIO(b)).convert("RGB")


def previews(design, video, out, ffmpeg):
    times = [3, 18, 49, 68, 79.7, 94, 108, 119, 124.7, 134, 149, 163, 173]
    sheet = Image.new("RGB", (1440, math.ceil(len(times)/3)*300), PAPER)
    for i, t in enumerate(times):
        im = design.frame(t, still(ffmpeg, video, t))
        im.save(out / f"preview-{t:05.1f}.jpg", quality=94)
        thumb = im.resize((480, 270), Image.Resampling.LANCZOS)
        x, y = i%3*480, i//3*300
        sheet.paste(thumb, (x, y+30))
        text(ImageDraw.Draw(sheet), (x+10, y+6), f"{t:g} s", 17)
    sheet.save(out / "storyboard.jpg", quality=94)
    design.intro(3).save(out / "DirectHome_Dynamic_Poster.jpg", quality=96)


def score(out):
    """Original deterministic 108-BPM instrumental; no samples, external music or TTS."""
    sr = 48000
    n = DURATION*sr
    music = np.zeros((n, 2), dtype=np.float32)
    rng = np.random.default_rng(20261103)
    def put(audio, start, gain, pan=0.0):
        k = round(start*sr)
        if k >= n:
            return
        audio = audio[:n-k] * gain
        music[k:k+len(audio), 0] += audio*math.sqrt((1-pan)/2)
        music[k:k+len(audio), 1] += audio*math.sqrt((1+pan)/2)
    beatlen = 60/108
    # Warm suspended chords, soft plucks and a restrained half-time pulse.
    chords = [(130.81, 164.81, 196.00, 293.66), (110, 130.81, 164.81, 246.94),
              (87.31, 130.81, 174.61, 220), (98, 146.83, 196, 246.94)]
    for bar in range(math.ceil(DURATION/(4*beatlen))):
        start = bar*4*beatlen
        chord = chords[(bar//2)%4]
        tt = np.arange(int(4*beatlen*sr))/sr
        envelope = np.minimum(tt/.3, 1)*np.minimum((tt[-1]-tt)/.7, 1)
        pad = sum(np.sin(2*np.pi*f*tt)+.22*np.sin(2*np.pi*(f*1.003)*tt) for f in chord)/5
        put(pad*envelope, start, .018, -.15)
        for j in range(4):
            tt = np.arange(int(.8*sr))/sr
            f = chord[j]*2
            pluck = (np.sin(2*np.pi*f*tt)+.2*np.sin(4*np.pi*f*tt))*np.exp(-tt*7)*np.minimum(tt/.012, 1)
            put(pluck, start+j*beatlen, .026, (-.5 if j%2 else .5))
        for j in [0, 2]:
            tt = np.arange(int(.22*sr))/sr
            kick = np.sin(2*np.pi*(48*tt+45*.035*(1-np.exp(-tt/.035))))*np.exp(-tt*21)
            put(kick, start+j*beatlen, .065)
        for j in range(8):
            tt = np.arange(int(.055*sr))/sr
            noise = rng.normal(0, 1, len(tt))
            noise = np.concatenate(([0], np.diff(noise)))
            put(noise*np.exp(-tt*100), start+(j+.5)*beatlen/2, .004, .3)
    for start in [7, 64, 79, 124, 169]:
        tt = np.arange(int(.5*sr))/sr
        whoosh = rng.normal(0, 1, len(tt))
        whoosh = np.convolve(whoosh, np.ones(14)/14, mode="same")
        put(whoosh*np.sin(np.pi*tt/.5)**2, start-.3, .028, -.2)
        tt = np.arange(int(.65*sr))/sr
        put(np.sin(2*np.pi*523.25*tt)*np.exp(-tt*8), start, .028, .25)
    fade = np.minimum(np.arange(n)/(sr*1.3), 1)*np.minimum(np.arange(n)[::-1]/(sr*2), 1)
    music *= fade[:, None]
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes((np.clip(music, -1, 1)*32767).astype("<i2").tobytes())


def render(design, video, out, ffmpeg, ui_video=None):
    silent = out / "picture.mp4"
    with (out/"decode.log").open("w") as de, (out/"encode.log").open("w") as en:
        decoder = subprocess.Popen([ffmpeg, "-v", "error", "-i", str(ui_video or video), "-an", "-vf", f"fps={FPS}",
                                    "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], stdout=subprocess.PIPE, stderr=de)
        encoder = subprocess.Popen([ffmpeg, "-v", "error", "-y", "-f", "rawvideo", "-vcodec", "rawvideo",
                                    "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
                                    "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-threads", "4",
                                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(silent)], stdin=subprocess.PIPE, stderr=en)
        try:
            for i in range(DURATION*FPS):
                raw = decoder.stdout.read(1280*720*3)
                if len(raw) != 1280*720*3:
                    raise RuntimeError(f"Incomplete source frame {i}")
                frame = Image.frombytes("RGB", (1280, 720), raw)
                encoder.stdin.write(design.frame(i/FPS, frame).tobytes())
                if i % (FPS*5) == 0:
                    print(f"RENDER {i//FPS:3d}/{DURATION}s", flush=True)
            encoder.stdin.close()
            decoder.stdout.close()
            if encoder.wait() != 0 or decoder.wait() != 0:
                raise RuntimeError("Video encoding/decoding failed; inspect logs")
        finally:
            for proc in [decoder, encoder]:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()
    return mix_versions(video, out, ffmpeg)


def mix_versions(video, out, ffmpeg):
    """Remix existing picture without re-encoding it; also used by audio QA."""
    silent = out/"picture.mp4"
    score(out/"original-score.wav")
    target = out / "DirectHome_Dynamic_Editorial_20261103.mp4"
    # Narration samples retain timing. Music is gently ducked by the original voice.
    filters = ("[1:a]aresample=48000,volume=2.2,asplit=2[voice][key];"
               "[2:a]volume=0.7[score];"
               "[score][key]sidechaincompress=threshold=0.018:ratio=5:attack=12:release=320[bed];"
               "[voice][bed]amix=inputs=2:normalize=0,alimiter=limit=0.94:level=false:latency=true[mix]")
    run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-i", video,
         "-i", out/"original-score.wav", "-filter_complex", filters, "-map", "0:v:0", "-map", "[mix]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-t", DURATION, "-movflags", "+faststart", target])
    # Also preserve the exact original compressed voice stream for a no-music option.
    clean = out / "DirectHome_Dynamic_VoiceOnly_20261103.mp4"
    run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-i", video,
         "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-t", DURATION, "-movflags", "+faststart", clean])
    return target, clean


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output-dir", type=Path, default=DEFAULT)
    p.add_argument("--fetch-source", action="store_true")
    p.add_argument("--ui-source", type=Path, help="Fresh 1280x720 / 175s product footage; keep original narration")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--preview-only", action="store_true")
    mode.add_argument("--audio-only", action="store_true", help="Remix an existing picture.mp4; do not render frames again")
    a = p.parse_args()
    out = a.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    hashes = prepare(out/"source", a.fetch_source)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    video = out/"source"/MOVIE
    ui_video = a.ui_source.resolve() if a.ui_source else None
    if ui_video and not ui_video.is_file():
        p.error("Fresh UI source does not exist")
    if a.audio_only:
        previous = out/"edit-manifest.json"
        if not previous.is_file() or not (out/"picture.mp4").is_file():
            p.error("--audio-only requires an existing completed render and edit-manifest.json")
        old = json.loads(previous.read_text(encoding="utf-8"))
        if sha(out/"picture.mp4") != old.get("pictureSha256"):
            p.error("Existing picture checksum mismatch")
        target, clean = mix_versions(video, out, ffmpeg)
    else:
        design = Designer(out/"source")
        previews(design, ui_video or video, out, ffmpeg)
        if a.preview_only:
            print("PREVIEW_OK", out/"storyboard.jpg")
            return
        target, clean = render(design, video, out, ffmpeg, ui_video)
    manifest = {
        "schema": "directhome-dynamic-edit-v1", "durationSeconds": DURATION, "fps": FPS,
        "width": W, "height": H, "sourceRelease": RELEASE, "sourceSha256": hashes,
        "outputs": {target.name: sha(target), clean.name: sha(clean)},
        "pictureSha256": sha(out/"picture.mp4"),
        "voice": "Original released Kokoro narration; original 175s timing, no new TTS",
        "music": "Original deterministic 108 BPM NumPy synthesis, seed 20261103; no samples",
        "masterAudio": "Original narration +6.85 dB, score -3.10 dB and sidechain ducking; AAC re-encode",
        "voiceOnlyAudio": "Original AAC stream copied unchanged",
        "editorialGraphics": "Post-production; not additional in-product features",
        "photoCutawaySeconds": [64, 73], "confirmationCaptionChanges": [103, 114],
        "disclosures": ["Fictional registry and participants", "Genuine previously recorded Meta results",
                        "Local deterministic rights extraction", "No title certification or contract signing"],
        "newModelCalls": 0,
    }
    if ui_video:
        manifest["freshUiSource"] = {"path": str(ui_video), "sha256": sha(ui_video)}
    elif a.audio_only and old.get("freshUiSource"):
        manifest["freshUiSource"] = old["freshUiSource"]
    (out/"edit-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf-8")
    print("RENDER_OK", target, flush=True)


if __name__ == "__main__":
    main()
