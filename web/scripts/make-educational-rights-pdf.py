#!/usr/bin/env python3
"""Synthetic title-record handout for a reproducible in-browser demo. NOT official."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
import sys

out=Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont("Nanum","/usr/share/fonts/truetype/nanum/NanumGothic.ttf"))
pdfmetrics.registerFont(TTFont("NanumB","/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"))
c=canvas.Canvas(str(out),pagesize=A4,pageCompression=0,invariant=1)
w,h=A4
c.setFillColor(HexColor("#f6f8fc"));c.rect(0,0,w,h,fill=1,stroke=0)
c.setFillColor(HexColor("#14384f"));c.roundRect(33,h-145,w-66,112,12,fill=1,stroke=0)
c.setFillColor(HexColor("#ffffff"));c.setFont("NanumB",19)
c.drawString(53,h-78,"등기사항증명서 이해를 위한 가상 예시")
c.setFont("Nanum",10);c.drawString(53,h-101,"DIRECTHOME - EDUCATIONAL MOCK REGISTRY - NOT OFFICIAL")
c.setFillColor(HexColor("#f9d983"));c.setFont("NanumB",11)
c.drawString(53,h-123,"교육용 합성 문서 · 실제 주소 / 권리 / 소유권 증명이 아닙니다")
def section(y,title,rows):
 c.setFillColor(HexColor("#e7f0f7"));c.roundRect(40,y-13,w-80,31,6,fill=1,stroke=0)
 c.setFillColor(HexColor("#17445c"));c.setFont("NanumB",13);c.drawString(53,y-3,title)
 cy=y-46
 for row in rows:
  c.setFillColor(HexColor("#374c62"));c.setFont("Nanum",10.7)
  c.drawString(52,cy,row)
  c.setStrokeColor(HexColor("#e0e7ee"));c.line(52,cy-7,w-52,cy-7)
  cy-=32
 return cy-17
y=h-191
y=section(y,"표제부 | 집합건물의 표시",[
 "주소 | 서울특별시 가상구 데모로 101 (교육용 가상주소)",
 "건물 | 데모아파트 제105동 제5층 제501호",
 "전유부분 | 아파트 59.84㎡ · 주거용"])
y=section(y,"【갑 구】 소유권에 관한 사항",[
 "1 | 소유권이전 | 2026.01.10 | 가상 소유자 (신원정보 생략)",
 "2 | 가압류 | 2026.03.12 | 청구금액 금2,000만원"])
y=section(y,"【을 구】 소유권 이외의 권리에 관한 사항",[
 "1 | 근저당권설정 | 2026.02.20 | 채권최고액 금1억2천만원정",
 "2 | 근저당권설정 | 2026.04.15 | 채권최고액 금6,000만원정"])
c.setFillColor(HexColor("#fff6e7"));c.roundRect(40,60,w-80,81,8,fill=1,stroke=0)
c.setFillColor(HexColor("#76551e"));c.setFont("NanumB",11);c.drawString(53,118,"원문 확인이 필요한 항목")
c.setFont("Nanum",9.5)
c.drawString(53,100,"채권최고액은 현재 대출잔액이 아닙니다. 가압류/소유권/말소 효력은 별도 확인하세요.")
c.drawString(53,80,"이 페이지는 시연용 창작 문서이며 법적 효력이나 공식 발급번호가 없습니다.")
c.setFillColor(HexColor("#6c7d8b"));c.setFont("Nanum",8)
c.drawString(40,34,"DIRECTHOME / FICTIONAL REGISTRY / VIDEO DEMO ONLY")
c.save()
print(out,str(out.stat().st_size))
