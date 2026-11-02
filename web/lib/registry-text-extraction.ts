import type {RightEntry,RightKind,RightSection} from "./registry-rights-analysis";

/**
 * P9 text-layer adapter, not a PDF parser, OCR engine, official title record
 * validator or identity verifier. Input comes from locally copied PDF text.
 * It NEVER sends a document anywhere and NEVER returns raw text or PII.
 *
 * Every extracted right starts as status=unknown. It cannot become current or
 * cancelled until a human chooses a status after checking the original page.
 */
export type RegistryTextEvidence={
  page:number|null;line:number;section:RightSection;
  rankNumber:number|null;label:string; // constructed solely from allowlisted labels/numbers
};
export type RegistryTextCandidate={
  id:string;
  entry:RightEntry;
  evidence:RegistryTextEvidence;
  amountEvidence:"same_row"|"next_row"|"missing";
  cancellationMentioned:boolean;
  reviewRequired:true;
  warnings:string[];
};
export type RegistryTextExtraction={
  schema:"registry-text-extraction-v1";
  documentKind:"registry_like"|"unrecognized";
  candidates:RegistryTextCandidate[];
  cancellationMentions:number;
  warnings:string[];
  coverage:{linesRead:number;sectionHeaders:number;candidateRows:number;unresolvedCancellationRows:number};
};
export const REGISTRY_TEXT_MAX_CHARS=120_000;
export const REGISTRY_TEXT_MAX_LINES=1800;
export const REGISTRY_TEXT_MAX_RIGHTS=50;
const kinds:Array<[RightKind,RegExp]>=[
  ["lease_registration",/임차권\s*등기(?:명령)?/],
  ["auction_commencement",/(?:임의|강제)?경매\s*개시(?:결정)?/],
  ["provisional_registration",/가등기/],
  ["provisional_disposition",/가처분/],
  ["provisional_seizure",/가압류/],
  ["seizure",/(?:^|[^가])압류/],
  ["trust",/신탁\s*(?:등기|설정|재산|원부)?/],
  ["mortgage",/(?:근\s*)?저당권/],
  ["lease_right",/전세권/],
];
const labels:Record<RightKind,string>={
  mortgage:"근저당권/저당권",seizure:"압류",provisional_seizure:"가압류",
  trust:"신탁",lease_right:"전세권",lease_registration:"임차권등기",
  auction_commencement:"경매개시",provisional_registration:"가등기",
  provisional_disposition:"가처분",other:"기타",
};

function cleanLine(value:string):string{
 return value.replace(/[\u200b-\u200d\ufeff]/g,"")
  .replace(/[\t\u00a0]/g," ").replace(/\s{2,}/g," ").trim();
}
function kindOf(value:string):RightKind|null{
 for(const [key,regex] of kinds)if(regex.test(value))return key;
 return null;
}
function sectionOf(value:string):RightSection|null{
 const t=value.replace(/\s+/g,"");
 if(/^\s*(?:【|\[|\()?갑구(?:】|\]|\))?/.test(t) && /갑구/.test(t.slice(0,5)))return "갑구";
 if(/^\s*(?:【|\[|\()?을구(?:】|\]|\))?/.test(t) && /을구/.test(t.slice(0,5)))return "을구";
 if(/^\s*(?:【|\[|\()?표제부(?:】|\]|\))?/.test(t) && /표제부/.test(t.slice(0,5)))return "unknown";
 return null;
}
function rankOf(line:string):number|null{
 const match=line.match(/^\s*(\d{1,5})\s*(?:\||[\t]|\s{2,}|번\s+|\s+(?=(?:\d{1,4}번)?(?:근저당권|저당권|가압류|압류|가처분|경매|신탁|임차권|전세권|가등기)))/);
 if(!match)return null;
 const n=Number(match[1]);
 return Number.isSafeInteger(n)&&n>=1&&n<=100000?n:null;
}
function dateOf(text:string):string|undefined{
 const match=text.match(/(20\d{2})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일)?/);
 if(!match)return undefined;
 const iso=match[1]+"-"+match[2].padStart(2,"0")+"-"+match[3].padStart(2,"0");
 const time=Date.parse(iso+"T00:00:00Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===iso?iso:undefined;
}
/**
 * Numeric conversion is exact integer arithmetic in units of 만원.
 * Not a loan balance and never a legal risk-score calculation.
 */
function smallKoreanNumber(raw:string):number|null{
 const s=raw.replace(/,/g,"").trim();
 if(/^\d+$/.test(s))return Number(s);
 let rest=s, total=0;
 for(const [mark,mult] of [["천",1000],["백",100],["십",10]] as const){
  const m=rest.match(new RegExp("^(\\d*)"+mark));
  if(m){total+=(m[1]?Number(m[1]):1)*mult;rest=rest.slice(m[0].length);}
 }
 if(rest){
  if(!/^\d+$/.test(rest))return null;
  total+=Number(rest);
 }
 return Number.isSafeInteger(total)?total:null;
}
function claimMaximum(text:string):number|null{
 // Only amounts explicitly introduced by 채권최고액 can enter the mortgage total.
 const match=text.replace(/\s+/g,"").match(/채권최고액(?:금)?([\d,천백십억만원정\.]+)(?=$|[|·;]|채무자|근저당권자|권리자|접수|등기원인)/);
 if(!match)return null;
 const token=match[1].replace(/정$/,"");
 let manwon:number|null=null;
 const won=token.match(/^([\d,]+)원$/);
 if(won){
  const n=Number(won[1].replace(/,/g,""));
  manwon=Number.isSafeInteger(n)&&n%10000===0?n/10000:null;
 }else if(token.includes("억")){
  const [eok,tail]=token.split("억");
  const high=smallKoreanNumber(eok);
  const low=tail?smallKoreanNumber(tail.replace(/만원?$/,"").replace(/원$/,"")):0;
  if(high!==null&&low!==null && /(?:억원?|만원)$/.test(token))manwon=high*10000+low;
 }else if(token.endsWith("만원")){
  manwon=smallKoreanNumber(token.slice(0,-2));
 }else if(token.endsWith("만")){
  manwon=smallKoreanNumber(token.slice(0,-1));
 }
 return manwon!==null&&Number.isSafeInteger(manwon)&&manwon>=0&&manwon<=100_000_000?manwon:null;
}
function sourceLines(text:string):Array<{text:string;line:number;page:number|null}>{
 let page:number|null=null;
 const out:Array<{text:string;line:number;page:number|null}>=[];
 let number=0;
 for(const raw of text.replace(/\r\n?/g,"\n").split(/(\f|\n)/)){
  if(raw==="\f"){page=page===null?2:page+1;continue;}
  if(raw==="\n")continue;
  number++;
  const marker=raw.match(/^\s*\[PAGE\s+(\d{1,3})\]\s*$/i);
  if(marker){page=Number(marker[1]);continue;}
  out.push({text:raw,line:number,page});
  if(number>REGISTRY_TEXT_MAX_LINES)break;
 }
 return out;
}
export function extractRegistryText(raw:unknown):RegistryTextExtraction{
 const out:RegistryTextExtraction={
  schema:"registry-text-extraction-v1",documentKind:"unrecognized",
  candidates:[],cancellationMentions:0,warnings:[],
  coverage:{linesRead:0,sectionHeaders:0,candidateRows:0,unresolvedCancellationRows:0},
 };
 if(typeof raw!=="string"||raw.length<10){
  out.warnings.push("문서 텍스트를 확인할 수 없습니다. PDF 뷰어에서 선택한 텍스트를 붙여넣었는지 확인하세요.");
  return out;
 }
 if(raw.length>REGISTRY_TEXT_MAX_CHARS){
  out.warnings.push("입력 길이 상한을 초과했습니다. 내용이 외부로 전송되지 않았으며, 필요한 페이지를 나누어 확인하세요.");
  return out;
 }
 const lines=sourceLines(raw);out.coverage.linesRead=lines.length;
 if(lines.length>=REGISTRY_TEXT_MAX_LINES){
  out.warnings.push("줄 수 상한에 도달했습니다. 일부 기재가 누락됐을 수 있으니 페이지를 나누어 확인하세요.");
 }
 let section:RightSection="unknown",headings=0;
 const cancellations:Array<{kind:RightKind;section:RightSection;target:number|null;line:number;page:number|null}>=[];
 for(let i=0;i<lines.length;i++){
  const line=cleanLine(lines[i].text);
  if(!line)continue;
  const detected=sectionOf(line);
  if(detected!==null){section=detected;headings++;continue;}
  // No claims outside 갑구 / 을구, to avoid free-text explanatory false positives.
  if(section==="unknown")continue;
  // Detect a right ONLY in the numbered 등기목적 column, not an incidental\n  // word in creditor/owner notes. Copied PDF cell columns may be pipe-separated.\n  const columns=line.split("|");\n  const purpose=columns.length>=2?columns[1]:line;\n  const kind=kindOf(purpose);if(!kind)continue;
  const rank=rankOf(lines[i].text);
  if(rank===null)continue; // not a recognizable numbered registry row
  if(/말\s*소/.test(line)){
   out.cancellationMentions++;
   const match=line.match(/(\d{1,5})번\s*(?:근저당권|저당권|가압류|압류|가처분|경매|신탁|임차권|전세권|가등기)/);
   const target=match?Number(match[1]):null;
   cancellations.push({kind,section,target,line:lines[i].line,page:lines[i].page});
   continue;
  }
  if(out.candidates.length>=REGISTRY_TEXT_MAX_RIGHTS){
   out.warnings.push("권리 후보 50건 상한에 도달했습니다. 다른 페이지는 별도로 검토하세요.");
   break;
  }
  let amountEvidence:"same_row"|"next_row"|"missing"="missing";
  let amount=kind==="mortgage"?claimMaximum(line):null;
  if(amount!==null)amountEvidence="same_row";
  else if(kind==="mortgage"&&i+1<lines.length){
   const next=cleanLine(lines[i+1].text);
   if(/채권최고액/.test(next) && rankOf(lines[i+1].text)===null && sectionOf(next)===null){
    amount=claimMaximum(next);
    if(amount!==null)amountEvidence="next_row";
   }
  }
  const date=dateOf(line);
  const code="p"+(lines[i].page??"u")+"-l"+lines[i].line+"-n"+out.candidates.length;
  const safeLabel=[labels[kind],section,"순위번호 "+rank,
   date?"등기일 "+date:null,
   amount===null?null:"채권최고액 "+amount+"만원"].filter(Boolean).join(" · ");
  const warnings=[
   "복사된 텍스트로 찾은 후보입니다. 실제 권리의 효력과 원문 서식을 확인해야 합니다.",
  ];
  if(kind==="mortgage"&&amount===null)warnings.push("채권최고액을 확정 추출하지 못했습니다.");
  out.candidates.push({
   id:code,entry:{
    id:code,kind,section,status:"unknown",registrationDate:date,rankNumber:rank,
    claimMaximumManwon:kind==="mortgage"?amount:null,
   },
   evidence:{page:lines[i].page,line:lines[i].line,section,rankNumber:rank,label:safeLabel},
   amountEvidence,cancellationMentioned:false,reviewRequired:true,warnings,
  });
 }
 out.coverage.sectionHeaders=headings;
 out.coverage.candidateRows=out.candidates.length;
 out.documentKind=headings>0?"registry_like":"unrecognized";
 let unmatched=0;
 for(const cancellation of cancellations){
  const candidate=out.candidates.find(c=>c.entry.kind===cancellation.kind &&
    c.entry.section===cancellation.section && cancellation.target!==null &&
    c.entry.rankNumber===cancellation.target);
  if(candidate){
   candidate.cancellationMentioned=true;
   candidate.warnings.push("말소 기재가 별도 행에 보입니다. 원문에서 대상 등기와 말소 완료 여부를 직접 대조해야 합니다.");
  }else unmatched++;
 }
 out.coverage.unresolvedCancellationRows=unmatched;
 if(out.documentKind==="unrecognized"){
  out.warnings.push("갑구·을구 표제를 확인하지 못했습니다. 다른 문서일 수 있으니 결과를 적용하지 마세요.");
 }else if(out.candidates.length===0){
  out.warnings.push("구조화된 권리 행을 찾지 못했습니다. 권리가 없다는 의미가 아닙니다.");
 }
 if(unmatched>0)out.warnings.push("대상 등기를 연결하지 못한 말소기재가 "+unmatched+"건 있습니다. 원문을 확인하세요.");
 if(out.candidates.length>0)out.warnings.push("원본 PDF의 취소선·표 셀 병합·정렬·페이지 연결은 복사 텍스트만으로 검증할 수 없습니다.");
 return out;
}
