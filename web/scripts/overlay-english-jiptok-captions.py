#!/usr/bin/env python3
"""Add contextual PDF inset and English translations beside Korean Jiptok chat.

This is documentary post-production of the filmed DirectHome UI, not a product
translation feature. There are no new AI or TTS calls. Original Kokoro audio is
copied without transcoding. Source PDF is ORIGINAL and fictional (never Dangdang).
"""
import argparse
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

W,H=1280,720
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
NAVY="#193C51"
TEAL="#1D7666"
GREY="#58717F"
def font(size,bold=False):
 return ImageFont.truetype(FONT_BOLD if bold else FONT_REG,size)
def text_width(d,txt,f):
 return d.textbbox((0,0),txt,font=f)[2]
def wrap(d,txt,f,limit):
 words=txt.split()
 lines=[]
 current=""
 for word in words:
  trial=(current+" "+word).strip()
  if current and text_width(d,trial,f)>limit:
   lines.append(current);current=word
  else:current=trial
 if current:lines.append(current)
 return lines
def soft_shadow(d,box,r=20):
 x1,y1,x2,y2=box
 d.rounded_rectangle((x1+5,y1+7,x2+5,y2+7),radius=r,fill=(8,32,46,32))
 d.rounded_rectangle(box,radius=r,fill=(250,253,254,250),outline=(183,219,209,255),width=2)
def small_pill(d,at,label):
 x,y=at; f=font(14,True);w=int(text_width(d,label,f)+22)
 d.rounded_rectangle((x,y,x+w,y+30),radius=14,fill=(221,244,232,255))
 d.text((x+11,y+6),label,font=f,fill=TEAL)
def paragraph(d,at,s,size=18,color=NAVY,width=354,line_height=None):
 x,y=at; f=font(size); lh=line_height or size+11
 for line in wrap(d,s,f,width):
  d.text((x,y),line,font=f,fill=color);y+=lh
 return y
def pdf_inset(pdf_png):
 im=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
 x,y=905,99
 soft_shadow(d,(x,y,x+340,y+476))
 small_pill(d,(x+17,y+17),"ORIGINAL SOURCE  /  DEMO")
 d.text((x+19,y+59),"Same fictional registry PDF",font=font(15,True),fill=NAVY)
 pic=Image.open(pdf_png).convert("RGB")
 pic=ImageOps.contain(pic,(290,342),Image.Resampling.LANCZOS)
 px=x+(340-pic.width)//2;py=y+90
 d.rectangle((px-2,py-2,px+pic.width+2,py+pic.height+2),fill="#D0DFE2")
 im.paste(pic,(px,py))
 d.text((x+21,y+439),"Used again in the rights review",font=font(13),fill=GREY)
 return im
def subtitle_panel(stage):
 im=Image.new("RGBA",(W,H),(0,0,0,0));d=ImageDraw.Draw(im)
 x,y=804,162;w=437;bottom=555
 soft_shadow(d,(x,y,x+w,bottom))
 small_pill(d,(x+19,y+16),"EN  /  TRANSLATION")
 d.text((x+20,y+59),"Jiptok conversation",font=font(23,True),fill=NAVY)
 d.line((x+20,y+97,x+w-20,y+97),fill="#D7E8E5",width=2)
 if stage==0:
  entries=[
   ("OWNER  |  PROPOSED TERMS",
    "A KRW 30 million deposit and KRW 680,000 monthly rent work for me."),
   ("JIPTOK  |  RECAP",
    "Those terms were suggested in chat. Each person needs to confirm the same proposal below.")
  ]
 elif stage==1:
  entries=[
   ("JIPTOK  |  CONFIRMATION STATUS",
    "The visitor has confirmed the proposal."),
   ("STILL OUTSTANDING",
    "The owner has not yet approved. One person's answer is not bilateral agreement.")
  ]
 else:
  entries=[
   ("JIPTOK  |  STATUS UPDATE",
    "Both people have confirmed the same deposit and rent."),
   ("NEXT TO CHECK",
    "Review the registry and owner identity before contract preparation. Jiptok does not sign contracts.")
  ]
 yy=y+117
 for title,body in entries:
  d.rounded_rectangle((x+16,yy,x+w-16,yy+111),radius=13,fill=(236,247,244,255))
  d.text((x+32,yy+12),title,font=font(14,True),fill=TEAL)
  paragraph(d,(x+32,yy+38),body,size=17,width=w-70,line_height=23)
  yy+=124
 d.text((x+20,bottom-19),"Translated captions  |  Synthetic demo",font=font(12),fill=GREY)
 return im
def probe(path):
 raw=subprocess.check_output(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(path)])
 return json.loads(raw)
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--video",required=True)
 p.add_argument("--pdf-image",required=True)
 p.add_argument("--output",required=True)
 a=p.parse_args()
 v=Path(a.video);pic=Path(a.pdf_image);out=Path(a.output)
 if not v.is_file() or not pic.is_file():raise SystemExit("Required input missing")
 meta=probe(v)
 if not 172<float(meta["format"]["duration"])<179:raise SystemExit("Unexpected input length")
 if not {"audio","video"} <= {x["codec_type"] for x in meta["streams"]}:
  raise SystemExit("Source must contain narration and video")
 out.parent.mkdir(parents=True,exist_ok=True)
 temp=out.parent/"_caption_panels"
 temp.mkdir(exist_ok=True)
 paths=[temp/"registry_source.png",temp/"jiptok_proposal.png",temp/"jiptok_pending.png",temp/"jiptok_confirmed.png"]
 pdf_inset(pic).save(paths[0])
 for idx in range(3):subtitle_panel(idx).save(paths[idx+1])
 # Each still is an RGBA full-frame overlay, shown only at the documented
 # video chapter timestamps. Chat remains visible on the left.
 ranges=[(9.5,26.0),(84,103),(103,114),(114,125)]
 ff=["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(v)]
 for fp in paths:ff+=["-loop","1","-framerate","24","-i",str(fp)]
 filters=[]
 before="[0:v]"
 for idx,(start,end) in enumerate(ranges):
  after=f"[v{idx}]"
  filters.append(f"{before}[{idx+1}:v]overlay=x=0:y=0:enable='between(t,{start},{end})':eof_action=pass{after}")
  before=after
 command=ff+["-filter_complex",";".join(filters),"-map",before,"-map","0:a:0",
  "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p",
  "-r","24","-c:a","copy","-movflags","+faststart","-t","175",str(out)]
 subprocess.run(command,check=True)
 done=probe(out);dur=float(done["format"]["duration"])
 assert 174<dur<176,dur
 assert {"audio","video"} <= {s["codec_type"] for s in done["streams"]}
 print("CAPTIONED_DEMO_VERIFIED",str(out),"duration",dur,"bytes",out.stat().st_size,flush=True)
if __name__=="__main__":main()
