/**
 * P12 - Evidence from independently published guidance, not user truth labels.
 *
 * Checks specific, non-PII assertions in the publishers' CURRENT HTML.
 * No HTML, name, address, ID, IP, PDF, or literal page excerpts are saved
 * or printed. Only allowlisted public pages and fixed categorical outcomes.
 *
 * Network errors are "unavailable", NEVER a passing safety assessment.
 */
import {readFile} from "node:fs/promises";
const db=JSON.parse(await readFile(new URL("../tests/fixtures/registry-web-evidence.v1.json",import.meta.url),"utf8"));
const required=[
 {id:"HUG-EXAMPLE",hostname:"www.khug.or.kr",
  literals:["갑구","을구","압류","근저당권설정","채권최고액","2,000,000,000원","2022년1월13일","2018년8월6일"]},
 {id:"DANGDANG-EXAMPLES",hostname:"dangdang.io",
  literals:["표제부","갑구","을구","가압류","근저당","경매개시","2억9천만원"]},
];
const optional=[
 {id:"HF-CHECKLIST",hostname:"corp.hf.go.kr",literals:["등기부등본","근저당","가압류"]},
];
async function readPublicHtml(source,expectedHost){
 const url=new URL(source.url);
 if(url.protocol!=="https:"||url.hostname!==expectedHost)throw Error("host_not_allowlisted");
 const res=await fetch(url,{
  signal:AbortSignal.timeout(18000),
  headers:{Accept:"text/html,application/xhtml+xml"},
 });
 if(!res.ok||new URL(res.url).hostname!==expectedHost)throw Error("publisher_unavailable");
 const type=res.headers.get("content-type")??"";
 if(!/(?:html|text\/plain)/i.test(type))throw Error("unsupported_content_type");
 const length=Number(res.headers.get("content-length")??0);
 if(length>3*1024*1024)throw Error("source_over_limit");
 let size=0;const parts=[];
 if(!res.body)throw Error("empty_body");
 for await(const chunk of res.body){
  size+=chunk.byteLength;
  if(size>3*1024*1024)throw Error("source_over_limit");
  parts.push(chunk);
 }
 const charset=type.match(/charset\s*=\s*([^;\s]+)/i)?.[1]??"utf-8";
 let body;
 try{body=new TextDecoder(charset,{fatal:false}).decode(Buffer.concat(parts.map(x=>Buffer.from(x)),size));}
 catch{body=new TextDecoder("utf-8").decode(Buffer.concat(parts.map(x=>Buffer.from(x)),size));}
 const visible=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
   .replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ");
 return visible.replace(/\s+/g,"");
}
let hardFail=false,requiredPassed=0;
for(const check of [...required,...optional]){
 const source=db.sources.find(x=>x.id===check.id);
 if(!source)throw Error("Missing source metadata");
 let status="UNAVAILABLE",passed=0;
 try{
  const html=await readPublicHtml(source,check.hostname);
  for(const literal of check.literals)if(html.includes(literal))passed++;
  status=passed===check.literals.length?"PASS":"SOURCE_CLAIM_MISMATCH";
 }catch{status="UNAVAILABLE";}
 if(required.some(x=>x.id===check.id)){
  if(status==="PASS")requiredPassed++;
  else hardFail=true;
 }
 console.log("PUBLIC_WEB_GUIDANCE "+JSON.stringify({id:check.id,
  status,checksVerified:passed,checksTotal:check.literals.length,
  domain:check.hostname,rawDocumentStored:false}));
}
console.log("PUBLIC_WEB_GUIDANCE_GATE "+JSON.stringify({
 requiredSources:required.length,passed:requiredPassed,
 status:hardFail?"FAIL":"PASS",judgment:"publisher text claims only; no complete legal/OCR truth",
}));
if(hardFail)process.exitCode=2;
