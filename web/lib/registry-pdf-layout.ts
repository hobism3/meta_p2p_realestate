/**
 * Local PDF.js text-layer geometry reconstruction. Pure and deterministic.
 *
 * The input must be text content from pages already loaded on the user's own
 * device. No raw PDF, personal names, source text or text item coordinates are
 * persisted, logged, or sent to a server by this module.
 *
 * Warning: coordinates reconstruct reading order only. They cannot establish
 * the meaning of a strikethrough, authenticity or a legal cancellation.
 */
export type PdfTextChunk={
 str:string;
 x:number;
 y:number;
 width:number;
 height:number;
 hasEOL?:boolean;
};
export type PdfTextPage={page:number;items:PdfTextChunk[]};
export type PdfTextAssembly={
 text:string;
 pages:number;
 pagesWithoutText:number[];
 lines:number;
 items:number;
 warnings:string[];
};
export const PDF_TEXT_MAX_BYTES=8*1024*1024;
export const PDF_TEXT_MAX_PAGES=20;
export const PDF_TEXT_MAX_ITEMS_PER_PAGE=9000;
export const PDF_TEXT_MAX_CHARS=120000;
const MAX_LINE_CHARS=1600;
const Y_TOLERANCE=3.5;

function asChunk(raw:PdfTextChunk):PdfTextChunk|null{
 if(!raw||typeof raw.str!=="string"||!raw.str.trim())return null;
 if(![raw.x,raw.y,raw.width,raw.height].every(Number.isFinite))return null;
 if(Math.abs(raw.x)>1e6||Math.abs(raw.y)>1e6||raw.width<0||raw.width>1e6||raw.height<0||raw.height>1e6)return null;
 return {str:raw.str.replace(/[\u200b-\u200d\ufeff\x00-\x08\x0b\x0e-\x1f]/g,"").slice(0,MAX_LINE_CHARS),
  x:raw.x,y:raw.y,width:raw.width,height:raw.height,hasEOL:raw.hasEOL===true};
}
function lineText(items:PdfTextChunk[]):string{
 const sorted=items.slice().sort((a,b)=>a.x-b.x);
 let text="",prev:PdfTextChunk|null=null;
 for(const current of sorted){
  if(prev){
   const gap=current.x-(prev.x+prev.width);
   // A table column break is *not* a word boundary. Mark it explicitly for
   // the existing P9 numbered-row parser, rather than concatenating amounts
   // with dates/owner names. Never emit a hidden raw PDF line in diagnostics.
   if(gap>Math.max(12,Math.max(current.height,prev.height)*1.5))text+=" | ";
   else if(gap>Math.max(1.8,Math.max(current.height,prev.height)*0.24)||
    /\s$/.test(prev.str)||/^\s/.test(current.str))text+=" ";
  }
  text+=current.str;
  prev=current;
  if(text.length>MAX_LINE_CHARS)return text.slice(0,MAX_LINE_CHARS);
 }
 return text.trim().replace(/\s{2,}/g," ");
}
function rowsOnPage(items:PdfTextChunk[]):string[]{
 const buckets:Array<{y:number;items:PdfTextChunk[]}>=[];
 for(const item of items){
  let target=buckets.find(row=>Math.abs(row.y-item.y)<=Math.max(Y_TOLERANCE,Math.min(5,item.height*0.4)));
  if(!target){target={y:item.y,items:[]};buckets.push(target);}
  target.items.push(item);
 }
 // PDF coordinates grow from bottom to top; rank needs to preserve on-page rows.
 buckets.sort((a,b)=>b.y-a.y);
 return buckets.map(row=>lineText(row.items)).filter(Boolean);
}
export function reconstructPdfText(pages:readonly PdfTextPage[]):PdfTextAssembly{
 const out:PdfTextAssembly={text:"",pages:0,pagesWithoutText:[],lines:0,items:0,warnings:[]};
 if(!Array.isArray(pages)||pages.length===0||pages.length>PDF_TEXT_MAX_PAGES){
  out.warnings.push("PDF 페이지 수가 범위를 벗어나 복원하지 않았습니다.");
  return out;
 }
 const buffers:string[]=[];
 let total=0;
 for(let i=0;i<pages.length;i++){
  const pg=pages[i];
  if(pg.page!==i+1||!Array.isArray(pg.items)||pg.items.length>PDF_TEXT_MAX_ITEMS_PER_PAGE){
   out.warnings.push("페이지 순서 또는 문자 객체 제한을 확인할 수 없어 복원을 중단했습니다.");
   return {...out,text:"",pages:0,pagesWithoutText:[],lines:0,items:0};
  }
  const valid=pg.items.map(asChunk).filter((v):v is PdfTextChunk=>v!==null);
  const lines=rowsOnPage(valid);
  out.items+=valid.length;out.pages++;
  out.lines+=lines.length;
  if(lines.length===0)out.pagesWithoutText.push(pg.page);
  const pageText="[PAGE "+pg.page+"]\n"+lines.join("\n");
  total+=pageText.length+1;
  if(total>PDF_TEXT_MAX_CHARS){
   return {text:"",pages:0,pagesWithoutText:[],lines:0,items:0,
    warnings:["PDF 텍스트 추출 상한을 넘었습니다. 일부만 분석하지 않고 전체 결과를 폐기했습니다."]};
  }
  buffers.push(pageText);
 }
 out.text=buffers.join("\n");
 if(out.pagesWithoutText.length)out.warnings.push("텍스트층이 없는 페이지 "+out.pagesWithoutText.length+"건. 스캔본/이미지일 수 있으므로 PDF 전체의 권리관계를 확인했다고 판단하지 않습니다.");
 if(out.items===0)out.warnings.push("선택 가능한 PDF 텍스트가 없습니다. OCR을 수행하지 않았으며 권리가 없다는 의미가 아닙니다.");
 out.warnings.push("PDF의 취소선·표 셀의 병합·겹쳐진 문자/문서 진위는 텍스트층 좌표만으로 검증할 수 없습니다.");
 return out;
}
