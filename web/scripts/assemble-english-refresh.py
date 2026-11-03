#!/usr/bin/env python3
"""Align fresh English UI shots with the existing narration; retain original Jiptok.

Each shot comes from a real local browser interaction, not DOM text replacement.
The authored Korean PDF and canonical property values remain original-language.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import imageio_ffmpeg

WEB=Path(__file__).resolve().parents[1]
OUT=WEB/'demo-artifacts/english-refresh'
BASE=WEB/'demo-artifacts/dynamic/source'
ORIGINAL=BASE/'DirectHome_3Chapters_Kokoro_English_Chat_Captions_20261103.mp4'
FF=imageio_ffmpeg.get_ffmpeg_exe()

# Narration is not accelerated. Recordings are held/retimed to the matching beat.
EDIT=[
 (0,7,None),
 (7,11,'01-register'),(11,15,'02-upload'),(15,24,'03-draft'),
 (24,29,'04-prefilled'),(29,34,'05-terms'),(34,46,'06-photo'),
 (46,55,'07-vision'),(55,60,'08-option'),(60,74,'09-comparison'),
 (74,76.5,'10-review'),(76.5,79,'11-saved'),
 (79,124,None),
 (124,132,'12-rights-start'),(132,141,'13-local-text'),
 (141,150,'14-candidates'),(150,157,'15-reviewed'),
 (157,162,'16-checklist'),(162,166,'17-findings'),(166,169,'18-findings-detail'),
 (169,175,None),
]

def run(args):
 subprocess.run([str(x) for x in args],check=True)

def main():
 capture=json.loads((OUT/'capture-manifest.json').read_text(encoding='utf-8'))
 if capture['translationIssues']:
  raise RuntimeError('Untranslated product UI remains; fix and re-record before assembling')
 assert capture['rightsCandidates']==3 and capture['listingCreated']
 shots={x['name']:x for x in capture['shots']}
 work=OUT/'aligned';work.mkdir(exist_ok=True)
 files=[]
 for i,(start,end,name) in enumerate(EDIT):
  src=OUT/'fresh-english-ui.webm' if name else ORIGINAL
  a,b=(shots[name]['start'],shots[name]['end']) if name else (start,end)
  if name and name not in ('11-saved','15-reviewed'):
   index=next(j for j,s in enumerate(capture['shots']) if s['name']==name)
   if index+1<len(capture['shots']):
    # Keep actual clicks/field updates leading to the next state. Exclude route
    # navigations, where the source has a brief pre-hydration loading frame.
    b=max(b,capture['shots'][index+1]['start']-.05)
  target=end-start
  path=work/f'{i:02d}.mp4';files.append(path)
  # Audio is sourced separately from the original release, never from these clips.
  run([FF,'-v','error','-y','-ss',a,'-t',b-a,'-i',src,'-an','-vf',
       f'setpts={target/(b-a):.9f}*(PTS-STARTPTS),fps=30,scale=1280:720:flags=lanczos,tpad=stop_mode=clone:stop_duration=1',
       '-frames:v',round(target*30),'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',path])
  print('ALIGNED',start,end,name or 'original intro/chat/outro',flush=True)
 concat=work/'concat.txt'
 concat.write_text(''.join(f"file '{p.resolve().as_posix()}'\n" for p in files),encoding='utf-8')
 target=OUT/'english-source.mp4'
 run([FF,'-v','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',target])
 final=OUT/'final';(final/'source').mkdir(parents=True,exist_ok=True)
 for name in [ORIGINAL.name,'source_meta_generated.jpg','empty_view_actual.webp']:
  shutil.copy2(BASE/name,final/'source'/name)
 manifest={
  'schema':'directhome-english-alignment-v1','durationSeconds':175,'edit':EDIT,
  'sourceCaptureSha256':hashlib.sha256((OUT/'fresh-english-ui.webm').read_bytes()).hexdigest(),
  'alignedSha256':hashlib.sha256(target.read_bytes()).hexdigest(),
  'retainedOriginalJiptokSeconds':[79,124],
  'originalLanguageExceptions':['Korean source PDF text','source names/addresses','retained Jiptok conversation'],
 }
 (OUT/'alignment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print('ENGLISH_ALIGNMENT_OK',target,flush=True)

if __name__=='__main__':main()
