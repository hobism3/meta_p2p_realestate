#!/usr/bin/env python3
"""Validate newly voiced kinetic deliverables, including preserved product pixels."""
import importlib.util
import json
import math
from pathlib import Path
import re
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


kinetic = module("kinetic", "render-kinetic-demo.py")
base = module("validation", "validate-dynamic-demo.py")
edit = kinetic.edit


def main():
    out = kinetic.OUT
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    manifest = json.loads((out/"edit-manifest.json").read_text(encoding="utf-8"))
    edit.prepare(kinetic.SOURCE, False)
    assert edit.sha(kinetic.UI)==manifest["freshUiSource"]["sha256"]
    voice = Path(manifest["narration"]["path"])
    assert edit.sha(voice)==manifest["narration"]["sha256"]
    assert edit.sha(out/"picture.mp4")==manifest["pictureSha256"]
    assert edit.sha(Path(kinetic.__file__))==manifest["rendererSha256"]
    report = {"sourceVerified": True, "narrationSource": str(voice), "files": {}}
    cues = json.loads((out/"voice/voice-cues.json").read_text(encoding="utf-8"))
    source = Path(cues["source"])
    assert edit.sha(source)==cues["sourceSha256"], "Narration script changed"
    assert cues["allCuesFit"] and not cues["speechTruncated"]
    assert cues["outputs"]["narration.m4a"]["sha256"]==edit.sha(voice)
    segments = cues["segments"]
    assert len(segments)==18, "Expected four opening cues and fourteen main scenes"
    script = json.loads(source.read_text(encoding="utf-8"))["segments"]
    assert " ".join(c["text"] for c in segments[:4])==script[0]["text"]
    assert [c["text"] for c in segments[4:]]==[s["text"] for s in script[1:]]
    for i,cue in enumerate(segments):
        assert edit.sha(out/"voice"/cue["file"])==cue["sha256"]
        assert cue["start"]<cue["end"]<=cue["deadline"]+.002
        assert cue["speed"]<=1.18
        assert abs(cue["end"]-cue["start"]-cue["duration"])<.002
        if i+1<len(segments):
            assert cue["end"]<segments[i+1]["start"]
    pending = next(c for c in segments if c["start"]==107)
    assert pending["end"]<=113
    report["narrationTiming"] = {"cues":len(segments), "allCuesFit":True, "speechTruncated":False,
        "maximumNativeSpeed":max(c["speed"] for c in segments), "pendingSpeechEnds":pending["end"],
        "finalSpeechEnds":segments[-1]["end"], "sourceSha256":cues["sourceSha256"]}
    master, clean = out/kinetic.MASTER, out/kinetic.CLEAN
    for path in [master, clean]:
        assert edit.sha(path)==manifest["outputs"][path.name]
        atoms = base.atoms(path)
        assert atoms.index("moov")<atoms.index("mdat")
        result = subprocess.run([ff, "-hide_banner", "-nostats", "-xerror", "-threads", "2", "-i", str(path),
                                "-af", "ebur128=peak=true", "-progress", "pipe:1", "-f", "null", "-"],
                                capture_output=True, text=True, encoding="utf-8", errors="replace")
        (out/(path.stem+"-decode.log")).write_text(result.stderr, encoding="utf-8")
        assert result.returncode==0, "Full decode failed"
        assert "Video: h264" in result.stderr and "yuv420p" in result.stderr
        assert "1920x1080" in result.stderr and "30 fps" in result.stderr and "Audio: aac" in result.stderr
        duration = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", result.stderr)
        h,m,s = map(float, duration.groups())
        seconds = h*3600+m*60+s
        assert abs(seconds-175)<.1
        frames = int(re.findall(r"frame=(\d+)", result.stdout)[-1])
        assert frames==5250
        tail = result.stderr.rsplit("Summary:", 1)[-1]
        loudness = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail)[1])
        peak = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)[1])
        assert peak<-.5 and -23<loudness<-15, (peak, loudness)
        report["files"][path.name] = {"decodeExitCode": 0, "frames": frames, "duration": seconds,
            "codec": "H.264 / AAC", "size": "1920x1080", "fps": 30, "faststart": True,
            "integratedLufs": loudness, "truePeakDbfs": peak,
            "bytes": path.stat().st_size, "sha256": edit.sha(path)}
        print("DECODE_OK", path.name, frames, loudness, peak, flush=True)
    assert base.aac_hash(ff, voice)==base.aac_hash(ff, clean), "New voice-only AAC changed"
    report["newVoiceOnlyAacBitIdentical"] = True
    spoken, mixed = base.pcm(ff, voice), base.pcm(ff, master)
    correlations = []
    for start in range(0,175,5):
        a = spoken[start*16000:(start+5)*16000]
        b = mixed[start*16000:(start+5)*16000]
        n = min(len(a),len(b))
        if n and np.sqrt(np.mean(a[:n]**2))>.005:
            correlations.append(float(np.corrcoef(a[:n],b[:n])[0,1]))
    assert correlations and min(correlations)>.97, min(correlations)
    report["minimumFiveSecondNarrationCorrelation"] = min(correlations)

    # Verify encoded product rectangles against recorded input, accounting only for
    # disclosed whole-frame timing holds. Text/state must not be painted into the UI.
    design = kinetic.KineticDesigner(kinetic.SOURCE, kinetic.UI, ff)
    pixel_checks = []
    for t in [18,49,94,100.5,102.9,103.1,108,112.9,113.9,114.1,134,149,163]:
        recorded = edit.still(ff, kinetic.UI, t)
        for hold, still in design.frame_holds:
            if hold["startFrame"]<=round(t*30)<hold["endFrame"]:
                recorded = still
        expected = np.asarray(recorded.resize((1376,774), Image.Resampling.BICUBIC), dtype=np.float32)
        actual = np.asarray(edit.still(ff, master, t).crop((88,272,1464,1046)), dtype=np.float32)
        error = float(np.mean(np.abs(actual-expected)))
        assert error<4, (t,error)
        pixel_checks.append({"time":t, "meanAbsolutePixelError":error})
    report["recordedUiPixelChecks"] = pixel_checks

    times = sorted(set(kinetic.PREVIEW_TIMES+[1.8,3.8,5.6,6.9,100.4,100.5,112.8,112.9,114.6]))
    sheet = Image.new("RGB", (1440, math.ceil(len(times)/3)*300), edit.PAPER)
    frames_dir = out/"qa-frames"
    frames_dir.mkdir(exist_ok=True)
    for i,t in enumerate(times):
        im = edit.still(ff, master, t)
        im.save(frames_dir/f"encoded-{t:06.2f}.jpg",quality=95)
        x,y = i%3*480,i//3*300
        sheet.paste(im.resize((480,270),Image.Resampling.LANCZOS),(x,y+30))
        edit.text(ImageDraw.Draw(sheet),(x+10,y+5),f"{t:g} s / ENCODED",16)
    sheet.save(out/"encoded-contact-sheet.jpg",quality=95)
    report["encodedStills"] = times
    (out/"validation.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("KINETIC_VALIDATION_OK",out/"validation.json",flush=True)


if __name__=="__main__":
    main()
