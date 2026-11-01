/**
 * Deterministic, local-only registry review of facts entered by the user.
 *
 * No PDF, owner name, resident registration number, address, account data or
 * free-text legal facts enter this model. There is deliberately no "safe" score,
 * automated priority ranking, legal certification or estimate of recoverability.
 * All numbers are expressed in 만원 and are not estimates of actual debt.
 */
export type RightKind =
  "mortgage"|"seizure"|"provisional_seizure"|"trust"|"lease_right"|
  "lease_registration"|"auction_commencement"|"provisional_registration"|
  "provisional_disposition"|"other";
export type RightStatus="active"|"cancelled"|"unknown";
export type RightSection="갑구"|"을구"|"unknown";
export type ReviewCheckKey="person_authority"|"prior_tenants"|"tax_arrears"|"building_register";
export type UserReviewStatus="not_checked"|"user_checked";

export type RightEntry={
  id:string;kind:RightKind;section:RightSection;status:RightStatus;
  registrationDate?:string;
  rankNumber?:number|null;
  claimMaximumManwon?:number|null;
  jointCollateralMentioned?:boolean; // user saw a joint-collateral note; NOT verified
  cancellationPromised?:boolean;     // a party says it will be cancelled; NOT cancelled
};
export type RightsReviewInput={
 issuedOn:string;
 asOfDate:string;
 proposedDepositManwon?:number|null;
 rights:readonly RightEntry[];
 checks?:Partial<Record<ReviewCheckKey,UserReviewStatus>>;
};
export type ReviewFinding={
 id:string;level:"attention"|"verify"|"information";title:string;detail:string;nextAction:string;
};
export type RightsReviewResult={
 findings:ReviewFinding[];
 activeMortgageMaximumManwon:number|null;
 activeMortgageCount:number;
 activeMortgageAmountsMissing:number;
 cancelledRecords:number;
 unknownStatusRecords:number;
 checkedItems:number;
 totalCheckItems:number;
 notes:string[];
};

export const RIGHT_LABELS:Record<RightKind,string>={
 mortgage:"근저당권·저당권",seizure:"압류",provisional_seizure:"가압류",
 trust:"신탁등기",lease_right:"전세권",lease_registration:"임차권등기",
 auction_commencement:"경매개시결정",provisional_registration:"가등기",
 provisional_disposition:"가처분",other:"그 밖의 기재",
};
export const REVIEW_CHECKS:Record<ReviewCheckKey,{label:string;nextAction:string}>={
 person_authority:{
  label:"계약 상대방의 신원·임대/대리 권한",
  nextAction:"실명 본인확인과 해당 물건의 소유·위임·신탁상 계약권한을 별도 증거로 확인하세요.",
 },
 prior_tenants:{
  label:"기존 임차인·선순위 보증금",
  nextAction:"등기되지 않은 선순위 임차인의 대항력·보증금을 적법한 절차로 확인하세요.",
 },
 tax_arrears:{
  label:"국세·지방세 체납 관련 확인",
  nextAction:"법령이 허용하는 체납 확인 절차·필요한 동의를 확인하세요.",
 },
 building_register:{
  label:"건축물대장·용도·위반건축물",
  nextAction:"건축물대장과 실제 사용 상태를 별도로 검토하세요.",
 },
};
const CHECK_KEYS=Object.keys(REVIEW_CHECKS) as ReviewCheckKey[];
const KIND_KEYS=new Set<RightKind>(Object.keys(RIGHT_LABELS) as RightKind[]);
const STATUS_KEYS=new Set<RightStatus>(["active","cancelled","unknown"]);
const MAX_MANWON=100_000_000;

function validManwon(value:unknown):value is number{
 return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=MAX_MANWON;
}
function parseDay(iso:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
 const timestamp=Date.parse(iso+"T00:00:00.000Z");
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==iso)return null;
 return timestamp;
}
function kindAction(kind:RightKind):string{
 switch(kind){
  case "mortgage":return "실제 대출잔액·말소 조건과 접수 순위, 채권최고액의 의미를 별도 확인하세요.";
  case "seizure":case "provisional_seizure":return "등기 접수·말소 여부, 집행 또는 보전 절차의 진행을 확인하세요.";
  case "trust":return "신탁원부, 수탁자·위탁자의 권한과 임대차 체결·보증금 수령 권한을 확인하세요.";
  case "lease_right":return "전세권의 권리자·설정 목적·접수일·말소 조건을 확인하세요. 확정일자에 따른 보호와 혼동하지 마세요.";
  case "lease_registration":return "임차권등기의 원인과 보증금 반환·말소 상태, 기존 임차인의 권리관계를 확인하세요.";
  case "auction_commencement":return "경매사건·개시결정의 효력, 진행 상태와 매각 여부를 공식 자료로 확인하세요.";
  case "provisional_registration":return "가등기 원인과 본등기 가능성, 관련 소유권 변동·대리권 관계를 확인하세요.";
  case "provisional_disposition":return "처분 제한의 현재 효력과 분쟁·말소 여부를 확인하세요.";
  default:return "정확한 권리 종류와 법적 효력을 원문·전문가를 통해 확인하세요.";
 }
}
/** A convenience threshold, explicitly NOT a statutory validity period. */
export const REVIEW_AGE_REMINDER_DAYS=7;
export function reviewRegistryRights(input:RightsReviewInput):RightsReviewResult{
 const findings:ReviewFinding[]=[];
 const issued=parseDay(input.issuedOn??"");
 const today=parseDay(input.asOfDate??"");
 if(issued===null||today===null||issued>today){
  findings.push({
   id:"document-date",level:"verify",title:"등기 발급 시점 확인 필요",
   detail:"발급일이 없거나 날짜가 유효하지 않습니다. 입력 내용은 공식 발급 문서와 대조되지 않았습니다.",
   nextAction:"정확한 주소·동·호·발급일·현행/말소 사항을 원본에서 직접 확인하세요.",
  });
 }else if(Math.floor((today-issued)/86400000)>REVIEW_AGE_REMINDER_DAYS){
  findings.push({
   id:"document-age",level:"verify",title:"등기정보 재확인 권장",
   detail:`발급 후 ${Math.floor((today-issued)/86400000)}일이 지났습니다. 7일은 앱 자체의 확인 알림 기준이며 법정 유효기간이 아닙니다.`,
   nextAction:"계약 전과 잔금 지급 전처럼 중요한 시점에는 최신 등기사항증명서를 다시 확인하세요.",
  });
 }
 const validRights=input.rights.slice(0,50).filter(
  r=>r&&typeof r.id==="string"&&KIND_KEYS.has(r.kind)&&STATUS_KEYS.has(r.status),
 );
 if(input.rights.length>50){
  findings.push({id:"entry-limit",level:"verify",title:"입력 기록 일부만 검토",
   detail:"한 번에 최대 50개 권리기재만 분석합니다. 일부가 제외됐습니다.",
   nextAction:"기재사항을 나누어 확인하고 원본과 항목 수를 대조하세요."});
 }
 if(validRights.length===0){
  findings.push({
   id:"unread-rights",level:"verify",title:"권리기재 여부 미확인",
   detail:"입력된 권리기재가 없습니다. 실제 등기부에 권리제한이 없다는 뜻이 아닙니다.",
   nextAction:"갑구·을구와 말소사항 여부, 신탁원부 등 추가 서류를 직접 확인하세요.",
  });
 }
 let activeMortgageMaximum=0,mortgageCount=0,mortgageMissing=0,cancelled=0,unknown=0;
 for(let index=0;index<validRights.length;index++){
  const right=validRights[index];
  if(right.status==="cancelled"){
   cancelled++;
   continue; // User input says cancelled; must still inspect original cancellation.
  }
  if(right.status==="unknown")unknown++;
  const label=RIGHT_LABELS[right.kind];
  const details=[`${label} · ${right.section==="unknown"?"등기구분 미확인":right.section}`];
  if(right.rankNumber!=null){
   if(Number.isSafeInteger(right.rankNumber)&&right.rankNumber>0&&right.rankNumber<=100000)
    details.push(`사용자 입력 순위번호 ${right.rankNumber}`);
   else details.push("순위번호 입력값 확인 필요");
  }
  if(right.registrationDate){
   if(parseDay(right.registrationDate)===null)details.push("접수일 입력값 확인 필요");
   else details.push(`사용자 입력 등기일 ${right.registrationDate}`);
  }
  if(right.kind==="mortgage"&&right.status==="active"){
   mortgageCount++;
   if(validManwon(right.claimMaximumManwon)){
    activeMortgageMaximum+=right.claimMaximumManwon;
    details.push(`입력한 채권최고액 ${right.claimMaximumManwon.toLocaleString("ko-KR")}만원`);
   }else mortgageMissing++;
  }
  if(right.jointCollateralMentioned===true && right.kind==="mortgage"){
   findings.push({
    id:`joint-${index}-${right.id}`,level:"verify",title:"공동담보 관련 기재가 입력됐습니다",
    detail:"공동담보는 여러 부동산이 하나의 채권을 담보할 수 있으므로 특정 호실의 부담·배당액을 단순 배분하거나 채권최고액을 부동산별 채무로 중복 합산할 수 없습니다.",
    nextAction:"공동담보목록·관련 부동산·채무의 범위와 변동·말소 여부를 원본 및 관계 자료로 확인하세요.",
   });
  }
  if(right.cancellationPromised===true){ // cancelled records have already continued above
   findings.push({
    id:`promise-${index}-${right.id}`,level:"attention",title:"말소 예정이라는 설명은 실제 말소가 아닙니다",
    detail:"사용자가 말소 약속을 표시했지만 입력된 권리 상태는 현행 또는 미확인입니다. 약속만으로 권리가 소멸하지 않습니다.",
    nextAction:"실제 말소등기의 접수·완료 및 최신 원문을 확인하고 특약 이행 여부를 별도로 검토하세요.",
   });
  }
  findings.push({
   id:`right-${index}-${right.id}`,
   level:right.status==="active"?"attention":"verify",
   title:`${label} · ${right.status==="active"?"현행으로 입력":"효력 상태 미확인"}`,
   detail:details.join(" · ")+". 입력값을 공식 등기 원문과 아직 독립적으로 대조하지 않았습니다.",
   nextAction:kindAction(right.kind)+(right.status==="unknown"?" 특히 말소 여부부터 확인하세요.":""),
  });
 }
 if(cancelled){
  findings.push({id:"cancelled",level:"information",title:`말소로 입력된 기록 ${cancelled}건`,
   detail:"말소로 입력된 권리는 현행 채권최고액 합산에서 제외했습니다. 실제로 말소가 완료됐는지는 원문을 확인해야 합니다.",
   nextAction:"말소기록의 효력과 이후에 설정된 새로운 권리 유무를 확인하세요."});
 }
 if(!Number.isSafeInteger(activeMortgageMaximum)||activeMortgageMaximum>MAX_MANWON*50){
  // Not an app failure: avoid reporting an imprecise financial total.
  findings.push({id:"numeric-limit",level:"verify",title:"합계 검증 필요",
   detail:"금액 합산의 범위가 커서 숫자를 제공하지 않습니다.",nextAction:"문서 원문 금액을 개별적으로 다시 확인하세요."});
 }
 const checked=CHECK_KEYS.filter(key=>input.checks?.[key]==="user_checked").length;
 for(const key of CHECK_KEYS){
  if(input.checks?.[key]!=="user_checked"){
   const item=REVIEW_CHECKS[key];
   findings.push({id:`check-${key}`,level:"verify",title:`${item.label} 미확인`,
    detail:"등기부만으로 확인할 수 없거나 별도 증빙이 필요한 항목입니다.",
    nextAction:item.nextAction});
  }
 }
 const prospective=validManwon(input.proposedDepositManwon)?input.proposedDepositManwon:null;
 const notes=[
  "입력한 내용만 분석했습니다. 본 결과는 거래 안전등급·소유권 인증·법률 자문·우선순위 또는 보증금 회수가능액의 산정이 아닙니다.",
  "채권최고액은 실제 채무잔액이 아닙니다. 말소로 입력한 항목은 별도 원문 확인이 필요하며 등기기록에 없는 선순위 임차인·세금도 존재할 수 있습니다.",
  "별도 자료를 확인했다고 체크해도 이는 이용자의 자기표시이며 플랫폼의 실명·소유권·임대권한 검증 결과가 아닙니다.",
  prospective===null?
   "보증금·가액·선순위 권리 등 확인되지 않은 사실을 임의 추정하지 않았습니다.":
   `입력한 보증금 ${prospective.toLocaleString("ko-KR")}만원은 사용자 제공 참고값입니다. 근저당 채권최고액과 단순 비교해도 안전 여부나 보증금 회수액은 계산할 수 없습니다.`,
  "데이터는 이 화면의 브라우저 메모리에서만 처리하고 서버·외부 AI에 전송하지 않습니다.",
 ];
 return {
  findings,
  activeMortgageMaximumManwon:mortgageCount>0&&mortgageMissing===0&&activeMortgageMaximum<=MAX_MANWON*50?activeMortgageMaximum:null,
  activeMortgageCount:mortgageCount,
  activeMortgageAmountsMissing:mortgageMissing,
  cancelledRecords:cancelled,
  unknownStatusRecords:unknown,
  checkedItems:checked,totalCheckItems:CHECK_KEYS.length,notes,
 };
}
