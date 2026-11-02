#!/usr/bin/env python3
"""Render text/photo cards from VERIFIED Meta evidence; no model calls, no fake labels."""
import hashlib,json,sys
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont

root=Path(sys.argv[1])
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
src=root/"source_meta_generated.jpg"
edited=root/"empty_view_actual.webp"
vision=json.loads((root/"vision_actual.json").read_text(encoding="utf-8"))
manifest=json.loads((root/"manifest.json").read_text(encoding="utf-8"))
sha=hashlib.sha256(src.read_bytes()).hexdigest()
assert sha==vision["sourceSha256"]==manifest["source_sha256"]
assert manifest["provider"]=="meta" and manifest["vision_success"] and manifest["edit_success"]
assert vision["provider"]=="meta" and vision["feature"]=="vision"
assert vision["review"]["room"]=="living_room"
assert "에어컨" in vision["review"]["features"]
assert Image.open(edited).format=="WEBP"
W,H=1280,720
white="#F9FBFF";pale="#B7C8E3";accent="#96F6CB"
font="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def text(d,xy,s,size=22,color=white,b=False):
 d.text(xy,s,font=ImageFont.truetype(bold if b else font,size),fill=color)
def background():
 im=Image.new("RGB",(W,H),(15,27,52))
 d=ImageDraw.Draw(im)
 d.rounded_rectangle((23,24,1257,660),radius=25,fill=(24,39,67))
 return im
def pill(d,xy,s,green=False):
 x,y=xy
 d.rounded_rectangle((x,y,x+min(455,len(s)*11+35),y+36),radius=17,fill="#1B5D4A" if green else "#2A4267")
 text(d,(x+15,y+8),s,16,accent if green else pale,True)
def footer(d,section,real=True):
 d.rectangle((0,676,1280,720),fill=(9,20,40))
 pill(d,(32,682),"ACTUAL META PROVIDER RESULT" if real else "SCRIPTED MOCK APPLICATION",real)
 text(d,(902,684),section,16,pale)
def photo(im,path,box):
 pic=Image.open(path).convert("RGB")
 x,y,w,h=box
 im.paste(ImageOps.fit(pic,(w,h),method=Image.Resampling.LANCZOS),(x,y))
 ImageDraw.Draw(im).rectangle((x,y,x+w,y+h),outline="#7185A9",width=2)
def save(im,name):
 im.save(out/name,optimize=True)
def intro():
 im=background();d=ImageDraw.Draw(im)
 pill(d,(66,74),"LIVE MODEL EVIDENCE",True)
 text(d,(66,165),"DirectHome",74,b=True)
 text(d,(66,269),"Real Meta AI Test",44,color="#9AC1FF",b=True)
 text(d,(66,368),"1 generated Korean apartment living room",28)
 text(d,(66,416),"1 real Muse Spark Vision analysis",28)
 text(d,(66,464),"1 real Muse Image furniture-removal edit",28)
 text(d,(66,576),"The following application flow is labeled Mock.",19,pale)
 footer(d,"01 / 05",True);save(im,"01_intro.png")
def generated():
 im=background();d=ImageDraw.Draw(im)
 text(d,(40,30),"1  |  Meta Muse Image  -  actual generation",30,b=True)
 photo(im,src,(48,106,736,511));d=ImageDraw.Draw(im)
 d.rounded_rectangle((811,106,1232,616),radius=18,fill=(32,49,78))
 pill(d,(830,132),"ACTUAL API RESULT",True)
 text(d,(836,210),"Synthetic",33,b=True)
 text(d,(836,263),"Korean apartment",24,color="#A7C9FF",b=True)
 text(d,(836,341),"Generated once using",20,pale)
 text(d,(836,373),"Meta Muse Image 1.0",20,pale)
 text(d,(836,444),"Not a real home's photo.",18,pale)
 text(d,(836,513),"SHA-256",16,pale)
 text(d,(836,542),sha[:26]+"...",14)
 footer(d,"02 / 05",True);save(im,"02_generate.png")
def detected():
 im=background();d=ImageDraw.Draw(im)
 text(d,(40,30),"2  |  Meta Muse Spark  -  actual photo analysis",30,b=True)
 photo(im,src,(48,106,736,511));d=ImageDraw.Draw(im)
 d.rounded_rectangle((811,106,1232,616),radius=18,fill=(32,49,78))
 pill(d,(829,132),"ACTUAL VISION RESPONSE",True)
 text(d,(832,212),"Room type",20,pale)
 text(d,(832,250),"Living Room",31,b=True)
 text(d,(832,330),"Visible items",20,pale)
 for i,f in enumerate(vision["review"]["features"][:4]):
  translated={"에어컨":"Air conditioner","시스템에어컨":"Built-in air conditioner"}.get(f,f)
  text(d,(832,378+i*40),"- "+translated,23,accent,True)
 text(d,(832,564),"PASS: AIR CONDITIONER DETECTED",14,accent,True)
 footer(d,"03 / 05",True);save(im,"03_vision.png")
def edit():
 im=background();d=ImageDraw.Draw(im)
 text(d,(40,30),"3  |  Meta Muse Image  -  actual furniture removal",30,b=True)
 photo(im,src,(50,118,570,447))
 photo(im,edited,(661,118,570,447))
 d=ImageDraw.Draw(im)
 pill(d,(65,135),"ORIGINAL - SYNTHETIC")
 pill(d,(678,135),"REAL META EDIT",True)
 text(d,(55,591),"AI simulation only. Not evidence of actual property condition.",19,pale)
 footer(d,"04 / 05",True);save(im,"04_edit.png")
def ending():
 im=background();d=ImageDraw.Draw(im)
 text(d,(66,196),"DirectHome",68,b=True)
 text(d,(66,307),"From photos to confirmed next steps",31,color="#B0D0FF",b=True)
 text(d,(66,401),"Actual Meta AI tests  +  labeled Mock Jiptok workflow",22)
 text(d,(66,449),"All images are fictional. Human approval is never automated.",19,pale)
 footer(d,"05 / 05",False);save(im,"05_outro.png")
intro();generated();detected();edit();ending()
print("CARDS_VALIDATED",sha,"room",vision["review"]["room"],"features",vision["review"]["features"])
