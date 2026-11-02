import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {
 reconstructPdfText,PDF_TEXT_MAX_ITEMS_PER_PAGE,PDF_TEXT_MAX_PAGES,
 PDF_TEXT_MAX_CHARS,
} from "../lib/registry-pdf-layout.ts";
import {extractRegistryText} from "../lib/registry-text-extraction.ts";

const item=(str,x,y,width=75,height=10)=>({str,x,y,width,height});
const page=(num,items)=>({page:num,items});
const rightPage=()=>page(1,[
 // Deliberately scrambled input order: PDF page content order is not guaranteed.
 item("금1억2천만원정",410,670,85),
 item("채권최고액",340,670,64),
 item("【을 구】 소유권 이외의 권리에 관한 사항",40,735,340),
 item("2026.10.02",255,670,70),
 item("근저당권설정",112,670,100),
 item("1",40,670,11),
]);

describe("P10 spatial PDF text-layer reconstruction",()=>{
 it("sorts out-of-order PDF.js glyphs by page y/x and preserves column boundaries",()=>{
  const out=reconstructPdfText([rightPage()]);
  assert.equal(out.pages,1);
  assert.equal(out.lines,2);
  assert.equal(out.items,6);
  assert.ok(out.text.startsWith("[PAGE 1]\n【을 구】"));
  assert.match(out.text,/1\s*\|\s*근저당권설정/);
  const parsed=extractRegistryText(out.text);
  assert.equal(parsed.documentKind,"registry_like");
  assert.equal(parsed.candidates.length,1);
  assert.equal(parsed.candidates[0].entry.kind,"mortgage");
  assert.equal(parsed.candidates[0].entry.claimMaximumManwon,12000);
  assert.equal(parsed.candidates[0].entry.status,"unknown");
  assert.equal(parsed.candidates[0].evidence.page,1);
 });
 it("supports split Korean glyphs without inventing spaces",()=>{
  const out=reconstructPdfText([page(1,[
   item("【갑 구】",30,700,60),
   item("1",30,680,8),
   item("가",110,680,12),item("압류",122,680,23),
  ])]);
  assert.match(out.text,/가압류/);
  const parsed=extractRegistryText(out.text);
  assert.equal(parsed.candidates[0]?.entry.kind,"provisional_seizure");
 });
 it("reports empty scanned pages instead of equating no text with no rights",()=>{
  const out=reconstructPdfText([rightPage(),page(2,[])]);
  assert.deepEqual(out.pagesWithoutText,[2]);
  assert.ok(out.warnings.some(x=>x.includes("텍스트층")));
  assert.equal(out.text.includes("[PAGE 2]"),true);
  assert.equal(extractRegistryText(out.text).candidates.length,1);
  // Caller must reject automatic transfer because the whole document was incomplete.
 });
 it("retains page markers when two fully parsed text pages contain different rights",()=>{
  const out=reconstructPdfText([
   page(1,[item("【갑 구】",32,700,65),item("1",35,650,8),item("신탁등기",115,650,60)]),
   rightPage().items.length ? page(2,[item("【을 구】",32,700,65),item("2",35,650,8),item("근저당권설정",115,650,85)]) : page(2,[]),
  ]);
  assert.deepEqual(out.pagesWithoutText,[]);
  const parsed=extractRegistryText(out.text);
  assert.deepEqual(parsed.candidates.map(x=>x.entry.kind),["trust","mortgage"]);
  assert.deepEqual(parsed.candidates.map(x=>x.evidence.page),[1,2]);
 });
 it("refuses misordered pages, invalid coordinates and pages above safe bounds",()=>{
  const wrong=reconstructPdfText([page(3,[item("abc",1,5)])]);
  assert.equal(wrong.text,"");
  assert.equal(wrong.pages,0);
  const tooMany=reconstructPdfText(Array.from({length:PDF_TEXT_MAX_PAGES+1},(_,i)=>page(i+1,[])));
  assert.equal(tooMany.text,"");
  const items=[item("【갑 구】",0,700),...Array.from({length:PDF_TEXT_MAX_ITEMS_PER_PAGE},(_,i)=>item(String(i),0,690-i))];
  const oversized=reconstructPdfText([page(1,items)]);
  assert.equal(oversized.text,"");
  const invalid=reconstructPdfText([page(1,[item("bad",NaN,4),item("good",10,20)])]);
  assert.ok(!invalid.text.includes("bad"));
 });
 it("never silently truncate into a partial rights corpus when text limit is exceeded",()=>{
  const items=Array.from({length:90},(_,i)=>item("x".repeat(1550),0,700-i*6,1550,8));
  const out=reconstructPdfText([page(1,items)]);
  assert.equal(out.text,"");
  assert.equal(out.pages,0);
  assert.ok(out.warnings.some(w=>w.includes("상한")));
  assert.ok(PDF_TEXT_MAX_CHARS>=120000);
 });
 it("keeps duplicated same-line numeric chunks in evidence for a human reviewer",()=>{
  const out=reconstructPdfText([page(1,[
   item("【을 구】",20,720,58),
   item("1",20,680,7),
   item("근저당권설정",90,680,90),
   item("채권최고액 금8,000만원",220,680,180),
  ])]);
  const parsed=extractRegistryText(out.text);
  assert.equal(parsed.candidates.length,1);
  assert.equal(parsed.candidates[0].entry.claimMaximumManwon,8000);
 });
});
