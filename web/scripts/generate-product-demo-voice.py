#!/usr/bin/env python3
"""Generate the reviewed 175s product narration using local Kokoro af_heart.

Run with the isolated voice/.venv interpreter (kokoro-onnx==0.6.1, soundfile,
imageio-ffmpeg). Only --fetch-models performs downloads; speech inference is
entirely local. Cues that cannot fit at <=1.18 native speed fail without clipping.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import urllib.request

import imageio_ffmpeg
import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

WEB = Path(__file__).resolve().parents[1]
SOURCE = WEB / "scripts/video-assets/narration-product-review.en.json"
OUT = WEB / "demo-artifacts/kinetic-refresh/voice"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
MODELS = {
    "kokoro-v1.0.int8.onnx": "ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
RATE, DURATION, VOICE = 48000, 175, "af_heart"
INTRO = [(0.12, "List smarter."), (2.12, "Agree clearly."),
         (4.12, "Check the record."), (5.82, "DirectHome.")]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def command(args, **kwargs):
    return subprocess.run([str(v) for v in args], check=True, **kwargs)


def json_write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def get_models(path, fetch):
    path.mkdir(parents=True, exist_ok=True)
    for name, expected in MODELS.items():
        target = path/name
        if not target.is_file() and fetch:
            print("DOWNLOAD", name, flush=True)
            urllib.request.urlretrieve(RELEASE+name, target)
        if not target.is_file() or digest(target) != expected:
            raise RuntimeError(f"Missing or mismatched model: {target}. Use --fetch-models if missing.")


def cue_plan(source):
    data = json.loads(source.read_text(encoding="utf-8"))
    expected = "List smarter. Agree clearly. Check the record. DirectHome."
    if data["segments"][0]["text"] != expected:
        raise RuntimeError("Intro source copy changed; review the four kinetic cue timings first.")
    cues = [{"id": f"intro-{i+1}", "sourceIndex": 0, "start": start, "text": text}
            for i, (start, text) in enumerate(INTRO)]
    cues.extend({"id": f"scene-{s['index']:02d}", "sourceIndex": s["index"],
                 "start": float(s["start"]), "text": s["text"]}
                for s in data["segments"][1:])
    for i, cue in enumerate(cues):
        next_start = cues[i+1]["start"] if i+1 < len(cues) else DURATION
        cue["deadline"] = round(min(next_start-.2, 113.0 if cue["start"] == 107 else 174.8), 4)
        cue["availableSeconds"] = round(cue["deadline"]-cue["start"], 4)
        if cue["availableSeconds"] <= 0:
            raise RuntimeError("Invalid cue order")
    return cues


def silence_edges(audio, rate):
    """Remove only low-level edge padding, retaining 50/80ms around speech."""
    audible = np.flatnonzero(np.abs(audio) > .0006)
    if not audible.size:
        raise RuntimeError("Synthesis returned silence")
    first = max(0, int(audible[0])-round(.05*rate))
    last = min(len(audio), int(audible[-1])+1+round(.08*rate))
    return audio[first:last], {"headSamples": first, "tailSamples": len(audio)-last}


def cached_synthesis(engine, cue, speed, cache, model_hash):
    settings = {"text": cue["text"], "voice": VOICE, "speed": speed, "lang": "en-us",
                "sentencePause": .18, "clausePause": .08, "model": model_hash,
                "kokoroOnnx": importlib.metadata.version("kokoro-onnx"), "trimEdgesVersion": 1}
    key = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()
    wav, meta_path = cache/(key+".wav"), cache/(key+".json")
    if wav.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text())
        if digest(wav) == meta["sha256"]:
            samples, rate = sf.read(wav, dtype="float32")
            return samples, rate, meta
    if engine is None:
        raise RuntimeError("Required speech is not cached; use --synthesize")
    samples, rate = engine.create(cue["text"], voice=VOICE, speed=speed, lang="en-us",
                                  sentence_pause=.18, clause_pause=.08)
    if not np.isfinite(samples).all():
        raise RuntimeError("Synthesis returned non-finite audio")
    samples, trim = silence_edges(samples, rate)
    sf.write(wav, samples, rate, subtype="FLOAT")
    meta = {**settings, "cacheKey": key, "nativeRate": rate, "duration": len(samples)/rate,
            "edgeSilenceTrim": trim, "sha256": digest(wav)}
    json_write(meta_path, meta)
    return samples, rate, meta


def normalize(ff, source, target, target_lufs=-19):
    probe = command([ff, "-hide_banner", "-nostats", "-i", source, "-af",
                     f"loudnorm=I={target_lufs}:TP=-2:LRA=11:print_format=json", "-f", "null", "-"],
                    capture_output=True, text=True, encoding="utf-8", errors="replace")
    match = re.search(r'\{\s*"input_i".*?\}', probe.stderr, re.S)
    if not match:
        raise RuntimeError("FFmpeg loudness measurement missing")
    stats = json.loads(match.group())
    if stats["input_i"] == "-inf":
        raise RuntimeError("Cannot normalize silent narration")
    af = (f"loudnorm=I={target_lufs}:TP=-2:LRA=11:linear=true:"
          f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
          f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
          f"offset={stats['target_offset']}")
    command([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-af", af,
             "-ar", RATE, "-ac", "1", "-c:a", "pcm_s24le", target])
    return stats


def meter(ff, path, log):
    p = command([ff, "-hide_banner", "-nostats", "-xerror", "-i", path,
                 "-af", "ebur128=peak=true", "-f", "null", "-"],
                capture_output=True, text=True, encoding="utf-8", errors="replace")
    log.write_text(p.stderr, encoding="utf-8")
    summary = p.stderr.rsplit("Summary:", 1)[-1]
    h, m, s = map(float, re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr).groups())
    seconds = h*3600+m*60+s
    if abs(seconds-DURATION) > .03:
        raise RuntimeError(f"Encoded narration duration differs from {DURATION}s: {seconds}")
    return {"decodeExitCode": p.returncode,
            "durationSeconds": seconds,
            "integratedLufs": float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary)[1]),
            "truePeakDbfs": float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary)[1])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--fetch-models", action="store_true")
    parser.add_argument("--synthesize", action="store_true")
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    cache = out/"cache"
    cache.mkdir(exist_ok=True)
    stems = out/"stems"
    stems.mkdir(exist_ok=True)
    get_models(out/"models", args.fetch_models)
    source_hash = digest(args.source)
    plan = cue_plan(args.source)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    engine = None
    if args.synthesize:
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(out/"models/kokoro-v1.0.int8.onnx"), options,
                                       providers=["CPUExecutionProvider"])
        engine = Kokoro.from_session(session, str(out/"models/voices-v1.0.bin"))
    mix = np.zeros(RATE*DURATION, dtype=np.float32)
    completed, failures = [], []
    for cue in plan:
        speed = 1.06
        samples, native_rate, cached = cached_synthesis(engine, cue, speed, cache, MODELS["kokoro-v1.0.int8.onnx"])
        duration = len(samples)/native_rate
        attempts = [{"speed": speed, "seconds": duration}]
        if duration > cue["availableSeconds"]:
            speed = round(min(1.18, max(1.08, speed*duration/cue["availableSeconds"]*1.012)), 3)
            samples, native_rate, cached = cached_synthesis(engine, cue, speed, cache, MODELS["kokoro-v1.0.int8.onnx"])
            duration = len(samples)/native_rate
            attempts.append({"speed": speed, "seconds": duration})
        if duration > cue["availableSeconds"]:
            failed = {**cue, "attempts": attempts, "overrunSeconds": duration-cue["availableSeconds"]}
            failures.append(failed)
            print("CUE_NEEDS_COPY_REVIEW", cue["id"], round(duration, 3), cue["availableSeconds"], flush=True)
            continue
        raw = stems/(cue["id"]+"-raw.wav")
        stem = stems/(cue["id"]+".wav")
        sf.write(raw, samples, native_rate, subtype="FLOAT")
        normalized = normalize(ff, raw, stem)
        speech, rate = sf.read(stem, dtype="float32")
        if rate != RATE or len(speech)/rate > cue["availableSeconds"]+.002:
            raise RuntimeError("Normalization changed cue timing beyond the allowed slot")
        start = round(cue["start"]*RATE)
        end = start+len(speech)
        if end > len(mix) or np.any(mix[start:end]):
            raise RuntimeError("Narration overlap or out-of-range cue")
        mix[start:end] = speech
        entry = {**cue, "index": len(completed), "speed": speed, "duration": round(len(speech)/RATE, 6),
                 "end": round(end/RATE, 6), "file": str(stem.relative_to(out)).replace("\\", "/"),
                 "sha256": digest(stem), "cacheKey": cached["cacheKey"], "attempts": attempts,
                 "normalizationInput": normalized}
        completed.append(entry)
        json_write(out/"voice-cues-progress.json", {"segments": completed, "failures": failures})
        print("CUE_OK", cue["id"], "start", cue["start"], "end", entry["end"], "speed", speed, flush=True)
    if failures:
        json_write(out/"timing-review-required.json", {"failures": failures, "segments": completed})
        raise RuntimeError("Speech cannot fit at the allowed native speeds; review timing-review-required.json. No speech was truncated.")
    premix = out/"narration-pre-normalization.wav"
    sf.write(premix, mix, RATE, subtype="PCM_24")
    master = out/"narration.wav"
    normalize(ff, premix, master)
    info = sf.info(master)
    if info.frames != RATE*DURATION or info.samplerate != RATE:
        raise RuntimeError("Master duration is not exactly 175 seconds")
    aac = out/"narration.m4a"
    command([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", master, "-c:a", "aac",
             "-b:a", "192k", "-t", DURATION, "-movflags", "+faststart", aac])
    metrics = {name: meter(ff, out/name, out/(name+"-decode.log")) for name in [master.name, aac.name]}
    for name, value in metrics.items():
        if abs(value["integratedLufs"]+19) > .6 or value["truePeakDbfs"] > -1:
            raise RuntimeError(f"Master loudness/peak gate failed for {name}: {value}")
    if digest(args.source) != source_hash:
        raise RuntimeError("Narration source changed during inference; rerun using the cache.")
    result = {"schema": "directhome-product-narration-v1", "durationSeconds": DURATION,
              "sampleRate": RATE, "channels": 1, "voice": "Kokoro af_heart v1.0 / local ONNX inference",
              "newPaidApiCalls": 0, "source": str(args.source.resolve()), "sourceSha256": source_hash,
              "models": MODELS, "modelRelease": RELEASE,
              "dependencies": {name: importlib.metadata.version(name) for name in ["kokoro-onnx", "numpy", "onnxruntime", "soundfile"]},
              "segments": completed, "allCuesFit": True, "speechTruncated": False,
              "outputs": {name: {"sha256": digest(out/name), "bytes": (out/name).stat().st_size, **metrics[name]}
                          for name in [master.name, aac.name]}}
    json_write(out/"voice-cues.json", result)
    review_file = out/"timing-review-required.json"
    if review_file.is_file():
        prior = json.loads(review_file.read_text(encoding="utf-8"))
        json_write(review_file, {"resolved": True, "failures": [],
                                 "historicalFailures": prior.get("historicalFailures", prior.get("failures", [])),
                                 "resolution": "All cues fit the current approved timing plan; see voice-cues.json."})
    print("NARRATION_OK", master, "duration", DURATION, "metrics", json.dumps(metrics), flush=True)


if __name__ == "__main__":
    main()
