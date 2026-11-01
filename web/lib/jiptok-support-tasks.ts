/**
 * Jiptok provides neutral reminders derived solely from an already-authorized,
 * persisted transaction-state projection. It cannot propose prices, accept a
 * counteroffer, approve a visit, conclude a legal contract or send chat messages.
 */
import type {TransactionSnapshot,TransactionStage,TransactionStageKey} from "./transaction-projection";

export type CompanionTask={
 id:string;
 kind:"pending_confirmation"|"next_check"|"rights_check";
 title:string;description:string;
 target:"#deal-condition-cards"|"/registry/check"|null;
 actionLabel:string|null;
};
const stageText:Record<TransactionStageKey,{waiting:string;next:string;description:string}>={
 visit:{
  waiting:"방문 신청의 집주인 승인을 확인해 주세요",
  next:"방문 가능 시간과 신청 절차를 확인해 주세요",
  description:"방문 일정은 실제 예약 상태를 통해 확인하고, 당사자 승인 전에 확정이라고 안내하지 않습니다.",
 },
 price:{
  waiting:"가격 조건의 양측 확인이 남아 있어요",
  next:"가격 조건이 아직 확인되지 않았어요",
  description:"기존에 나온 제안만 확인하도록 안내합니다. 집톡이는 가격을 새로 제안하거나 절충하지 않습니다.",
 },
 living:{
  waiting:"관리비·옵션·수리 조건의 확인이 남아 있어요",
  next:"생활 조건과 수리·관리비를 점검해 주세요",
  description:"반려동물·주차 등 매물 정보와 실제 두 사람의 합의를 구분해 확인하세요.",
 },
 contract:{
  waiting:"계약일 관련 확인이 남아 있어요",
  next:"계약 준비 사항을 별도로 확인하세요",
  description:"조건 확인 카드는 법률상 계약서나 전자서명이 아닙니다. 실제 계약 문서·당사자 권한을 따로 확인하세요.",
 },
 earnest:{
  waiting:"계약금 조건의 확인이 남아 있어요",
  next:"계약금 조건·수령 주체를 확인하세요",
  description:"실제 송금 전 계약 상대방의 권한과 지급계좌 등은 당사자가 독립적으로 검증해야 합니다.",
 },
 handover:{
  waiting:"잔금·인도/입주 일정의 확인이 남아 있어요",
  next:"잔금일과 인도·입주일을 각각 확인하세요",
  description:"잔금 지급과 인도·입주가 완료됐다고 플랫폼이 추정하지 않습니다.",
 },
};
function pending(stage:TransactionStage):CompanionTask{
 const info=stageText[stage.key];
 return {id:`pending-${stage.key}`,kind:"pending_confirmation",
  title:info.waiting,description:stage.detail||info.description,
  target:stage.key==="visit"?null:"#deal-condition-cards",
  actionLabel:stage.key==="visit"?null:"양측 확인 카드 보기"};
}
function next(stage:TransactionStage):CompanionTask{
 const info=stageText[stage.key];
 return {id:`next-${stage.key}`,kind:"next_check",title:info.next,
  description:info.description,target:null,actionLabel:null};
}
const registryTask:CompanionTask={
 id:"registry-rights",kind:"rights_check",title:"등기·계약권한도 별도로 확인하세요",
 description:"소유자·게시자 신원, 대리 권한, 근저당·신탁, 선순위 임차인·체납세금 등은 채팅만으로 검증되지 않습니다.",
 target:"/registry/check",actionLabel:"등기 권리관계 점검 열기",
};
export function buildCompanionTasks(snapshot:TransactionSnapshot,max=4):CompanionTask[]{
 if(!snapshot||!Array.isArray(snapshot.stages))return [];
 const bounded=Math.max(1,Math.min(6,Number.isInteger(max)?max:4));
 const stages=snapshot.stages;
 const result:CompanionTask[]=[];
 // Preserve actual pending requests, never guess their approval outcome.
 for(const s of stages){
  if(s.status==="pending")result.push(pending(s));
 }
 // The registry reminder never disappears just because someone agreed on price.
 const tailSpace=Math.max(0,bounded-1);
 if(result.length<tailSpace){
  const nextStage=stages.find(s=>s.status==="not-started"||s.status==="discussing"||s.status==="partial");
  if(nextStage)result.push(next(nextStage));
 }
 const visible=result.slice(0,tailSpace);
 visible.push(registryTask);
 return visible;
}
