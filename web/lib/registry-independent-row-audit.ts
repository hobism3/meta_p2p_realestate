/**
 * P12 independent, conservative right-row signal audit.
 *
 * This is deliberately NOT a second copy of the P9 regex parser. It scans
 * visibly numbered purpose cells and compares their existence to P9's
 * structured candidates. Never claims complete/right/legal truth. It returns
 * aggregate counts and allowlisted metadata only (no raw PDF text or PII).
 */
import type {RegistryTextExtraction} from "./registry-text-extraction";

type AuditedKind="mortgage"|"seizure"|"provisional_seizure"|"trust"|"lease_right"|
 "lease_registration"|"auction_commencement"|"provisional_registration"|"provisional_disposition";
type Area="갑구"|"을구";
export type IndependentRightsAudit={
 schema:"independent-right-row-audit-v1";
 status:"aligned_observed_rows"|"needs_review"|"insufficient_observable_rows";
 observedRightRows:number;
 matched:number;
 missingInPrimary:number;
 notIndependentlyConfirmed:number;
 sectionAnomalies:number;
 complexSubrankRows:number;
 reasons:string[];
};
const PREFIX_KINDS:Array<[AuditedKind,RegExp]>=[
 ["lease_registration",/^임차권(?:등기|등기명령)/],
 ["auction_commencement",/^(?:임의|강제)?경매개시/],
 ["provisional_registration",/^(?:소유권이전청구권)?가등기/],
 ["provisional_disposition",/^가처분/],
 ["provisional_seizure",/^가압류/],
 ["seizure",/^압류/],
 ["trust",/^(?:신탁등기|신탁재산)/],
 ["mortgage",/^(?:근저당권|저당권)(?:설정|변경|이전|경정)?/],
 ["lease_right",/^전세권(?:설정|이전)?/],
];
const TITLE=/^(?:【|〖|\\[|\\(|『)?([갑을])구(?:】|〗|\\]|\\)|』)?/;
function section(line:string):Area|null{
 const m=line.trim().replace(/[\\s|│¦·]/g,"").match(TITLE);
 return m?(m[1]==="갑"?"갑구":"을구"):null;
}
function purposeKind(raw:string):AuditedKind|null{
 const col=raw.trim().replace(/\s+/g,"");
 if(/말소/.test(col))return null; // cancellation linkage requires separate evidence.
 for(const [kind,re] of PREFIX_KINDS)if(re.test(col))return kind;
 return null;
}
function key(s:Area,r:number,k:AuditedKind){return s+":"+r+":"+k;}
function flagSection(kind:AuditedKind,s:Area):boolean{
 // Not a legal inference; a likely wrong column/area mapping worth reviewing.
 if(s==="갑구"&&["mortgage","lease_right","lease_registration"].includes(kind))return true;
 if(s==="을구"&&["seizure","provisional_seizure","auction_commencement","trust"].includes(kind))return true;
 return false;
}
export function auditIndependentRightsRows(text:unknown,parsed:RegistryTextExtraction):IndependentRightsAudit{
 const out:IndependentRightsAudit={schema:"independent-right-row-audit-v1",
  status:"insufficient_observable_rows",observedRightRows:0,matched:0,
  missingInPrimary:0,notIndependentlyConfirmed:0,sectionAnomalies:0,
  complexSubrankRows:0,reasons:[]};
 if(typeof text!=="string"||text.length<10||text.length>120000){
  out.reasons.push("independent_input_unavailable");return out;
 }
 let current:Area|null=null;
 const observed=new Map<string,number>();
 for(const raw of text.split(/\r?\n/)){
  if(/^\s*\[PAGE\s+\d+\]/i.test(raw)){current=null;continue;}
  const title=section(raw);if(title){current=title;continue;}
  if(/^\s*(?:【|〖|\[)?표\s*제\s*부/.test(raw)){current=null;continue;}
  if(!current)continue;
  // Require an explicitly separated rank and a dedicated purpose cell.
  // This rejects incidental rights words in captions/creditor columns.
  const row=raw.match(/^\s*(\d{1,5})(-\d{1,4})?\s*\|\s*([^|]{1,110})(?:\||$)/);
  if(!row)continue;
  const kind=purposeKind(row[3]);if(!kind)continue;
  if(row[2]){out.complexSubrankRows++;continue;}
  const rank=Number(row[1]);
  const id=key(current,rank,kind);
  observed.set(id,(observed.get(id)??0)+1);
  out.observedRightRows++;
  if(flagSection(kind,current))out.sectionAnomalies++;
 }
 const primary=new Map<string,number>();
 for(const candidate of parsed.candidates){
  const e=candidate.entry;
  if(e.section!=="갑구"&&e.section!=="을구")continue;
  if(typeof e.rankNumber!=="number"||!Number.isInteger(e.rankNumber))continue;
  const id=key(e.section,e.rankNumber,e.kind as AuditedKind);
  primary.set(id,(primary.get(id)??0)+1);
 }
 for(const [id,n] of observed){
  const m=primary.get(id)??0;
  out.matched+=Math.min(n,m);
  out.missingInPrimary+=Math.max(0,n-m);
 }
 for(const [id,n] of primary){
  const m=observed.get(id)??0;
  out.notIndependentlyConfirmed+=Math.max(0,n-m);
 }
 if(out.missingInPrimary)out.reasons.push("visible_numbered_right_not_extracted");
 if(out.notIndependentlyConfirmed)out.reasons.push("primary_candidate_without_independent_row");
 if(out.sectionAnomalies)out.reasons.push("right_section_unexpected_review_required");
 if(out.complexSubrankRows)out.reasons.push("complex_subrank_requires_linkage_review");
 if(parsed.documentKind!=="registry_like")out.reasons.push("primary_document_structure_unrecognized");
 if(out.reasons.length)out.status="needs_review";
 else if(out.observedRightRows>0)out.status="aligned_observed_rows";
 else out.reasons.push("no_independent_observable_right_rows");
 return out;
}
