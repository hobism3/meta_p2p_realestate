/**
 * P11: public educational registry PDF acquisition / ephemeral evaluation.
 *
 * This script NEVER persists or prints PDF bytes, page text, addresses, person
 * names, ID numbers, creditor names, file URLs or legal status in CI logs.
 * Only explicit educational or fictional publisher sources are allowlisted.
 *
 * Live network is a non-deterministic optional corpus gate; P8/P9/P10 tests
 * remain offline/deterministic. Never run this for actual unconsented records.
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {reconstructPdfText,PDF_TEXT_MAX_BYTES,PDF_TEXT_MAX_PAGES,PDF_TEXT_MAX_ITEMS_PER_PAGE} from "../lib/registry-pdf-layout.ts";
import {extractRegistryText} from "../lib/registry-text-extraction.ts";

const manifest=JSON.parse(await readFile(new URL("../tests/fixtures/registry-public-sources.v1.json",import.meta.url),"utf8"));
const corpus=[
 ...manifest.references.map(x=>({...x,category:"fictional_registry_pdf"})),
 ...manifest.otherPublicPdfExamples.filter(x=>["EBS-LEGAL-2008","JOBGO-GA-2017"].includes(x.id)).map(x=>({...x,category:"educational_material_with_example"})),
];
const statuses=[];
const maxSeconds=22;

async function fetchBounded(url){
 const target=new URL(url);
 if(target.protocol!=="https:"||!["dangdang.io","wdown.ebsi.co.kr","cont0.jobgo.ne.kr"].includes(target.hostname))
  throw new Error("not_allowlisted");
 const res=await fetch(url,{
  redirect:"follow",signal:AbortSignal.timeout(maxSeconds*1000),
  headers:{Accept:"application/pdf"},
 });
 if(!res.ok)return {status:"http_"+res.status};
 const length=Number(res.headers.get("content-length")||0);
 if(length>PDF_TEXT_MAX_BYTES)return {status:"over_limit"};
 if(!res.body)return {status:"empty_body"};
 let total=0;const parts=[];
 for await(const chunk of res.body){
  total+=chunk.byteLength;
  if(total>PDF_TEXT_MAX_BYTES){await res.body.cancel?.().catch(()=>{});return {status:"over_limit"};}
  parts.push(Buffer.from(chunk));
 }
 const bytes=Buffer.concat(parts,total);
 if(bytes.byteLength<100||bytes.subarray(0,5).toString("ascii")!=="%PDF-")
  return {status:"not_pdf"};
 return {status:"acquired",bytes};
}
// Only categorical layout signals are logged. No original source characters,
 // names, addresses, amounts, IDs or free-text substrings leave the runner.
function structuralRows(text){
 const pattern=/(?:가압류|경매개시|저당권|신탁등기|전세권|임차권등기|가등기)/;
 const lines=text.split("\n");
 const result=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const match=line.match(pattern);
  if(!match)continue;
  const left=line.slice(0,match.index);
  const head=Array.from(line.trim().slice(0,20));
  const classify=ch=>/[0-9]/.test(ch)?"N":/[가-힣]/.test(ch)?"K":ch==="|"?"P":/\s/.test(ch)?"_":/[-.]/.test(ch)?"D":"O";
  const headPattern=head.map(classify).join("").replace(/([NKPO_D])\1{2,}/g,"$1$1+");
  const isolated=extractRegistryText("[PAGE 1]\n【갑 구】\n"+line);
  const headlines=lines.slice(0,i+1).map((value,idx)=>{
   const v=value.replace(/\s/g,"");
   const section=/^.{0,3}갑구/.test(v)?"갑구":/^.{0,3}을구/.test(v)?"을구":/^.{0,3}표제부/.test(v)?"표제부":null;
   return section?{row:idx+1,section}:null;
  }).filter(Boolean);
  result.push({row:i+1,keyword:match[0].replace(/\s/g,""),
   headPattern,startsRank:/^\s*\d{1,5}\s*(?:\||\s)/.test(line),
   pipes:(line.match(/\|/g)||[]).length,keywordInColumn:left.split("|").length,
   leftLength:left.length,fullLength:line.length,
   isolatedCandidates:isolated.candidates.length,lastHead:headlines.slice(-1)[0]??null});
  if(result.length>=15)break;
 }
 return result;
}
function structuralHeadingHints(text){
 const lines=text.split("\n"),result=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].replace(/\s+/g,"");
  const match=line.match(/갑구|을구|表題部|표제부/);
  if(!match)continue;
  const prefix=line.slice(0,match.index);
  const startChars=Array.from(line.slice(0,18));
  const shape=startChars.map(ch=>/[0-9]/.test(ch)?"N":/[가-힣]/.test(ch)?"K":ch==="|"?"P":/[〖〗【】()\[\]]/.test(ch)?"B":"O")
   .join("").replace(/([NKBPO])\1{2,}/g,"$1$1+");
  result.push({row:i+1,section:match[0],prefixLength:prefix.length,
   pipes:(line.match(/\|/g)||[]).length,shape});
  if(result.length>=20)break;
 }
 return result;
}
async function probePdf(bytes){
 const pdfjs=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,
  disableFontFace:true,useSystemFonts:false,disableAutoFetch:true,disableStream:true});
 let doc=null;
 const oldWarn=console.warn,oldError=console.error;
 // PDF.js warnings may include malformed embedded content/decoded PDF strings.
 // Count failures without echoing potentially identifying PDF contents.
 console.warn=()=>{}; console.error=()=>{};
 try{
  doc=await pdfjs.promise;
  if(doc.numPages<1||doc.numPages>PDF_TEXT_MAX_PAGES)
   return {status:"unsupported_pages",pages:doc.numPages};
  const pages=[];let textPages=0;
  for(let p=1;p<=doc.numPages;p++){
   const page=await doc.getPage(p);
   const layer=await page.getTextContent();
   if(layer.items.length>PDF_TEXT_MAX_ITEMS_PER_PAGE)
    return {status:"too_many_text_items",pages:doc.numPages};
   const items=[];
   for(const it of layer.items){
    if(!("str"in it)||!Array.isArray(it.transform)||it.transform.length<6)continue;
    items.push({str:it.str,x:it.transform[4],y:it.transform[5],
     width:it.width,height:it.height,hasEOL:it.hasEOL});
   }
   if(items.length>0)textPages++;
   pages.push({page:p,items});
   page.cleanup();
  }
  const result=reconstructPdfText(pages);
  if(!result.text)
   return {status:"nonreconstructable",pages:doc.numPages,textPages};
  const parsed=extractRegistryText(result.text);
  const kinds=Object.create(null);
  for(const found of parsed.candidates)kinds[found.entry.kind]=(kinds[found.entry.kind]||0)+1;
  const mortgages=parsed.candidates.filter(c=>c.entry.kind==="mortgage");
  const mortgageTotalManwon=mortgages.every(c=>c.entry.claimMaximumManwon!==null)?
   mortgages.reduce((sum,c)=>sum+(c.entry.claimMaximumManwon??0),0):null;
  return {status:"parsed_text_layer",pages:doc.numPages,textPages,
   items:result.items,lines:result.lines,sectionHeaders:parsed.coverage.sectionHeaders,
   candidates:parsed.candidates.length,cancellationMentions:parsed.cancellationMentions,
   unmatchedCancellationRows:parsed.coverage.unresolvedCancellationRows,
   amountsWithExactManwon:parsed.candidates.filter(c=>c.entry.kind==="mortgage"&&c.entry.claimMaximumManwon!==null).length,
   mortgageTotalManwon,
   kinds,documentKind:parsed.documentKind,rightRowShapes:structuralRows(result.text),headingShapes:structuralHeadingHints(result.text)};
 }catch{return {status:"pdf_parser_error"};}
 finally{
  console.warn=oldWarn;console.error=oldError;
  try{await doc?.destroy();}catch{}
  if(!doc){try{await pdfjs.destroy();}catch{}}
 }
}
for(const source of corpus){
 let result={id:source.id,category:source.category,status:"unavailable"};
 try{
  const response=await fetchBounded(source.url);
  if(response.status!=="acquired")result.status=response.status;
  else{
   const sha256=createHash("sha256").update(response.bytes).digest("hex");
   result={id:source.id,category:source.category,status:"acquired",bytes:response.bytes.length,sha256};
   if(source.sha256&&sha256!==source.sha256){
    result.status="pinned_hash_mismatch";
   }else{
    const evaluated=await probePdf(response.bytes);
    Object.assign(result,evaluated);
   }
  }
 }catch{result.status="network_or_other_error";}
 statuses.push(result);
 // This is the only stdout with external document-derived facts.
 console.log("PUBLIC_REGISTRY_CORPUS "+JSON.stringify(result));
}
const acquired=statuses.filter(s=>s.sha256).length;
const usable=statuses.filter(s=>s.status==="parsed_text_layer").length;
console.log("PUBLIC_REGISTRY_SUMMARY "+JSON.stringify({
 sources:corpus.length,acquired,usable,nonReconstructable:statuses.filter(s=>s.status==="nonreconstructable").length,
 externalAccess:"ephemeral-runner-memory-only",rawFilesSaved:false,rawTextLogged:false,
 verdict:acquired?"ACQUIRED_EDUCATIONAL_SOURCE_BYTES":"NO_DOWNLOAD_AVAILABLE",
}));
if(!acquired)process.exitCode=2;
