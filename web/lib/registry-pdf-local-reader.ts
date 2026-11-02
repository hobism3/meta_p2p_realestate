import {
 PDF_TEXT_MAX_BYTES,PDF_TEXT_MAX_PAGES,PDF_TEXT_MAX_ITEMS_PER_PAGE,
 reconstructPdfText,type PdfTextChunk,type PdfTextPage,type PdfTextAssembly,
} from "./registry-pdf-layout";

/**
 * PDF.js is dynamically imported ONLY after explicit local file selection.
 * The worker is copied from the exact pinned npm package by prebuild/predev
 * and served on the app origin. No CDN, upload, remote OCR, or model call.
 */
export async function extractRegistryPdfLocally(
 file:File,
 onProgress?:(page:number,total:number)=>void,
):Promise<PdfTextAssembly>{
 if(typeof window==="undefined")throw new Error("이 도구는 사용자 브라우저에서만 실행할 수 있습니다.");
 if(!(file instanceof File)||file.size<100||file.size>PDF_TEXT_MAX_BYTES)
  throw new Error("PDF 크기는 100바이트 이상 8MB 이하여야 합니다.");
 const signature=new Uint8Array(await file.slice(0,5).arrayBuffer());
 if(Array.from(signature).map(x=>String.fromCharCode(x)).join("")!=="%PDF-")
  throw new Error("PDF 헤더가 올바르지 않습니다.");
 // A locally generated script is always version-matched with the JS module.
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.4.10.38.min.mjs";
 const task=pdfjs.getDocument({
  data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,
  useSystemFonts:false,disableFontFace:true,
  disableAutoFetch:true,disableStream:true,
 });
 let doc:Awaited<typeof task.promise>|null=null;
 try{
  doc=await task.promise;
  if(doc.numPages===0||doc.numPages>PDF_TEXT_MAX_PAGES)
   throw new Error("최대 20페이지 PDF만 로컬에서 분석합니다.");
  const pages:PdfTextPage[]=[];
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n);
   const content=await page.getTextContent();
   if(content.items.length>PDF_TEXT_MAX_ITEMS_PER_PAGE)
    throw new Error("페이지 문자 객체 수가 너무 많습니다. 더 작은 페이지로 나누어 확인하세요.");
   const items:PdfTextChunk[]=[];
   for(const raw of content.items){
    if(!("str" in raw))continue;
    const pos=raw.transform;
    if(!Array.isArray(pos)||pos.length<6)continue;
    items.push({
     str:raw.str,
     x:pos[4],y:pos[5],width:raw.width,height:raw.height,
     hasEOL:raw.hasEOL,
    });
   }
   pages.push({page:n,items});
   page.cleanup();
   onProgress?.(n,doc.numPages);
  }
  return reconstructPdfText(pages);
 }catch(error){
  if(error instanceof Error && /최대 20페이지|문자 객체 수가 너무 많습니다/.test(error.message))
   throw error;
  // Never expose an untrusted document's own strings or stack in the UI/log.
  throw new Error("PDF 텍스트층을 읽지 못했습니다. 암호화·파손·스캔 또는 지원하지 않는 형식일 수 있습니다.");
 }finally{
  try{await doc?.destroy();}catch{ /* always release browser PDF resources */ }
  if(!doc){try{await task.destroy();}catch{ /* incomplete loading */ }}
 }
}
