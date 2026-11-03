#!/usr/bin/env python3
"""Rebuild the 2m55s natural-voice, actual-UI DirectHome hackathon film.

Every pixel of the core browser footage comes from Playwright operating the
real application. The service's source/edit photo responses are recorded
actual Meta outputs, NOT new model calls. Title-record PDFs and Jiptok users
are fictional, identified as such in captions and README.
"""
import json,subprocess,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
from pydub import AudioSegment
from pydub.generators import Sine

ROOT=Path.cwd()
ART=ROOT/"demo-artifacts"
RAW=ART/"three-chapter"/"directhome-three-chapter-draft.mp4"
CUES=ART/"three-chapter"/"chapter-cues.json"
VOICE=ART/"voice"
PDF_IMAGE=ART/"educational-rights-preview.png"
WORK=ART/"three-chapter-render"
OUTPUT=ART/"DirectHome_Three_Chapters_English_Demo_20261103.mp4"
WORK.mkdir(parents=True,exist_ok=True)

def run(args):
 p=subprocess.run([str(x) for x in args],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 if p.returncode:raise RuntimeError("FFmpeg/encoding failed: "+p.stderr.decode(errors="replace")[-1200:])

timeline=json.loads(CUES.read_text(encoding="utf8"))
marks={m["name"]:m["at"] for m in timeline["markers"]}
assert timeline["rightsCandidates"]>=2 and timeline["listingCreated"]
parts=[
 ("01_registration",0,marks["jiptok"],79.0),
 ("02_jiptok",marks["jiptok"],marks["rights_pdf"],45.0),
 ("03_rights",marks["rights_pdf"],marks["end"],45.0),
 ("04_end",marks["end"],66.32,6.0),
]
finals=[]
for name,start,end,target in parts:
 p=WORK/(name+".mp4")
 ratio=target/(end-start)
 base=["ffmpeg","-hide_banner","-loglevel","error","-y","-ss",start,"-t",end-start,"-i",RAW]
 if name=="03_rights":
  original=Image.open(PDF_IMAGE).convert("RGB")
  original=ImageOps.contain(original,(300,420),Image.Resampling.LANCZOS)
  inset=Image.new("RGBA",(354,508),(0,0,0,0));d=ImageDraw.Draw(inset)
  d.rounded_rectangle((3,4,350,504),radius=18,fill=(255,255,255,248),
   outline=(100,132,151,255),width=3)
  font="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
  d.text((19,17),"FICTIONAL REGISTRY PDF",font=ImageFont.truetype(font,15),fill=(16,85,78))
  inset.paste(original,((354-original.width)//2,50))
  d.text((23,475),"Locally processed in browser",font=ImageFont.truetype(font,11),
   fill=(78,105,117))
  insetPath=WORK/"educational_pdf_inset.png";inset.save(insetPath)
  f="[0:v]setpts=%.7f*(PTS-STARTPTS),fps=24,scale=1280:720:flags=lanczos[base];"%ratio
  f+="[1:v]format=rgba[doc];[base][doc]overlay=x=W-w-17:y=112:enable=between(t\\,1\\,10):format=auto,format=yuv420p[v]"
  args=base+["-loop","1","-framerate","24","-i",insetPath,
   "-filter_complex",f,"-map","[v]"]
 else:
  args=base+["-vf","setpts=%.7f*(PTS-STARTPTS),fps=24,scale=1280:720:flags=lanczos"%ratio]
 args+=["-an","-c:v","libx264","-preset","veryfast","-crf","20",
  "-pix_fmt","yuv420p","-r","24","-t",target,p]
 run(args);finals.append(p)

lst=WORK/"concat.txt"
lst.write_text("".join("file '"+str(p.resolve())+"'\n" for p in finals))
silent=WORK/"silent.mp4"
run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0",
 "-i",lst,"-an","-c","copy","-movflags","+faststart",silent])

voice_data=json.loads((VOICE/"voice-cues.json").read_text())
voice_segments=voice_data["segments"]
mix=AudioSegment.silent(duration=175000,frame_rate=44100).set_channels(2)
for i,entry in enumerate(voice_segments):
 start=float(entry["start"])
 next_start=float(voice_segments[i+1]["start"]) if i+1<len(voice_segments) else 175.0
 slot=next_start-start-0.17
 path=VOICE/entry["file"]
 audio=AudioSegment.from_file(path)
 actual=len(audio)/1000
 if actual>slot:
  fitted=WORK/("fit_%02d.wav"%i)
  rate=actual/slot+0.008
  run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",path,
   "-filter:a","atempo=%.4f,aresample=44100"%rate,"-ac","2",fitted])
  audio=AudioSegment.from_wav(fitted)
 mix=mix.overlay(audio.set_frame_rate(44100).set_channels(2).fade_in(90).fade_out(130),
  position=round(start*1000))
for sec in [0,79,124,169]:
 bell=Sine(620).to_audio_segment(duration=240,volume=-31).fade_in(30).fade_out(200)
 mix=mix.overlay(bell.set_channels(2),position=sec*1000)
wav=WORK/"neural_narration.wav"
mix.apply_gain(-0.5).export(wav,format="wav")
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",silent,"-i",wav,
 "-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k",
 "-af","highpass=f=60,lowpass=f=15500,alimiter=limit=0.92",
 "-movflags","+faststart","-t","175",OUTPUT])

result=json.loads(subprocess.check_output(["ffprobe","-v","error",
 "-show_format","-show_streams","-of","json",str(OUTPUT)]))
assert 174<float(result["format"]["duration"])<180
assert {"audio","video"} <= {s["codec_type"] for s in result["streams"]}
(ART/"three-chapter-edit-manifest.json").write_text(json.dumps({
 "durationSeconds":175,"voice":voice_data["voice"],"browserCaptureSynthetic":True,
 "photoOutputSource":"verified actual Meta responses, pre-recorded and replayed inside app",
 "registryImport":"educational Mock draft",
 "rightsReview":"browser-local deterministic extraction on authored fictional PDF",
 "jiptok":"synthetic participants with stored state machine",
 "chapters":parts},ensure_ascii=False,indent=2),encoding="utf8")
print("FINAL_DEMO_OK",str(OUTPUT),result["format"]["duration"],OUTPUT.stat().st_size)
