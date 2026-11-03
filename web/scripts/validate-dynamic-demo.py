#!/usr/bin/env python3
"""Decode the deliverables, check stream/audio integrity and export encoded QA frames."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location("dynamic_demo", Path(__file__).with_name("render-dynamic-demo.py"))
edit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edit)


def atoms(path):
    result = []
    with path.open("rb") as stream:
        while header := stream.read(8):
            size, kind = struct.unpack(">I4s", header)
            used = 8
            if size == 1:
                size = struct.unpack(">Q", stream.read(8))[0]
                used = 16
            result.append(kind.decode("ascii"))
            if not size:
                break
            if size < used:
                raise ValueError("Invalid MP4 atom size")
            stream.seek(size-used, 1)
    return result


def pcm(ff, path):
    b = subprocess.check_output([ff, "-v", "error", "-i", str(path), "-vn",
                                 "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"])
    return np.frombuffer(b, dtype="<f4")


def aac_hash(ff, path):
    b = subprocess.check_output([ff, "-v", "error", "-i", str(path), "-map", "0:a:0",
                                 "-c:a", "copy", "-f", "adts", "pipe:1"])
    return hashlib.sha256(b).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=edit.DEFAULT)
    args = parser.parse_args()
    out = args.output_dir.resolve()
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    source = out/"source"/edit.MOVIE
    master = out/"DirectHome_Dynamic_Editorial_20261103.mp4"
    clean = out/"DirectHome_Dynamic_VoiceOnly_20261103.mp4"
    manifest = json.loads((out/"edit-manifest.json").read_text(encoding="utf-8"))
    edit.prepare(out/"source", False)
    if manifest.get("freshUiSource"):
        fresh = manifest["freshUiSource"]
        assert edit.sha(Path(fresh["path"])) == fresh["sha256"], "Fresh UI source changed"
    report = {"sourceVerified": True, "files": {}}
    for path in [master, clean]:
        if edit.sha(path) != manifest["outputs"][path.name]:
            raise AssertionError("Output hash differs from render manifest")
        layout = atoms(path)
        assert layout.index("moov") < layout.index("mdat"), "Faststart missing"
        # Full decode and audio metering, including the final frame and audio tail.
        p = subprocess.run([ff, "-hide_banner", "-nostats", "-xerror", "-threads", "2", "-i", str(path),
                            "-af", "ebur128=peak=true", "-progress", "pipe:1", "-f", "null", "-"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        (out/(path.stem+"-decode.log")).write_text(p.stderr, encoding="utf-8")
        assert p.returncode == 0, "Complete decode failed"
        assert "Video: h264" in p.stderr and "yuv420p" in p.stderr
        assert "1920x1080" in p.stderr and "30 fps" in p.stderr
        assert "Audio: aac" in p.stderr
        duration = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr)
        assert duration, "Missing stream duration"
        h, m, s = map(float, duration.groups())
        seconds = h*3600+m*60+s
        assert abs(seconds-175) < .1, seconds
        frames = int(re.findall(r"frame=(\d+)", p.stdout)[-1])
        assert frames == 5250, frames
        tail = p.stderr.rsplit("Summary:", 1)[-1]
        loudness = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail)[1])
        peak = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)[1])
        assert peak < 0, f"Clipping risk: {peak} dBFS"
        report["files"][path.name] = {"decodeExitCode": 0, "frames": frames, "duration": seconds,
                                     "codec": "H.264 / AAC", "size": "1920x1080", "fps": 30,
                                     "faststart": True, "integratedLufs": loudness, "truePeakDbfs": peak,
                                     "bytes": path.stat().st_size, "sha256": edit.sha(path)}
        print("DECODE_OK", path.name, frames, loudness, peak, flush=True)
    # The no-music option must retain the exact compressed AAC packets.
    original_aac, clean_aac = aac_hash(ff, source), aac_hash(ff, clean)
    assert original_aac == clean_aac, "Voice-only AAC stream changed"
    report["voiceOnlyAacBitIdentical"] = True
    narration, mixed = pcm(ff, source), pcm(ff, master)
    correlations = []
    for start in range(0, 175, 5):
        a = narration[start*16000:(start+5)*16000]
        b = mixed[start*16000:(start+5)*16000]
        n = min(len(a), len(b))
        if n and np.sqrt(np.mean(a[:n]**2)) > .005:
            correlations.append(float(np.corrcoef(a[:n], b[:n])[0, 1]))
    assert correlations and min(correlations) > .97, "Narration alignment/intelligibility regression"
    report["minimumFiveSecondNarrationCorrelation"] = min(correlations)
    # These images come from the encoded deliverable, not the compositor previews.
    times = [3, 18, 49, 64.3, 68, 72.7, 79.7, 94, 102.9, 103.1, 108, 113.9, 114.1, 119,
             124.7, 134, 149, 163, 173]
    sheet = Image.new("RGB", (1440, ((len(times)+2)//3)*300), edit.PAPER)
    frames_dir = out/"qa-frames"
    frames_dir.mkdir(exist_ok=True)
    for i, t in enumerate(times):
        im = edit.still(ff, master, t)
        im.save(frames_dir/f"encoded-{t:05.1f}.jpg", quality=95)
        x, y = i%3*480, i//3*300
        sheet.paste(im.resize((480, 270), Image.Resampling.LANCZOS), (x, y+30))
        edit.text(ImageDraw.Draw(sheet), (x+10, y+5), f"{t:g} s / ENCODED", 16)
    sheet.save(out/"encoded-contact-sheet.jpg", quality=95)
    report["encodedStills"] = times
    (out/"validation.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print("VALIDATION_OK", out/"validation.json", flush=True)


if __name__ == "__main__":
    main()
