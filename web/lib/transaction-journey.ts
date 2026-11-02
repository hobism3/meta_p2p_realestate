/**
 * Read-only, neutral user-facing route through an actual room.
 * NEVER infers legal contract, owner/identity verification, registry validity,
 * signed documents, deposit safety, on-site visit or payment completion.
 */
import type {TransactionSnapshot,TransactionStage,TransactionStatus} from "./transaction-projection.ts";
export type JourneyStatus="app_confirmed"|"awaiting_both"|"discussion"|"unverified_external";
export type JourneyStep={
 key:"visit"|"terms"|"registry"|"legal_prep";
 title:string;status:JourneyStatus;statusLabel:string;detail:string;
 actionLabel:string;target:string|null;
};
export function buildTransactionJourney(snapshot:TransactionSnapshot,listingId:string):JourneyStep[]{
 if(!snapshot||!Array.isArray(snapshot.stages))return [];
 const stages=snapshot.stages;
 const at=(k:string)=>stages.find(x=>x.key===k);
 const visit=at("visit"),price=at("price"),living=at("living"),contract=at("contract"),earnest=at("earnest"),handover=at("handover");
 const visitConfirmed=visit?.status==="confirmed";
 const visitPending=visit?.status==="pending";
 const anyPending=[price,living,contract,earnest,handover].some(s=>s?.status==="pending"||s?.status==="partial");
 const priceConfirmed=price?.status==="confirmed";
 const termsOk=priceConfirmed&&!anyPending;
 const listingPath=/^[a-zA-Z0-9_-]{1,100}$/.test(listingId)?
   "/listings/"+encodeURIComponent(listingId)+"#registry-rights":"/registry/check";
 return [
  {key:"visit",title:"방문 일정",
   status:visitConfirmed?"app_confirmed":visitPending?"awaiting_both":"discussion",
   statusLabel:visitConfirmed?(snapshot.demo?"시연방 일정 확인":"집주인 예약 승인 기록"):
    visitPending?"승인 대기":"일정 확인 전",
   detail:visitConfirmed?
    "플랫폼에 기록된 예약 상태입니다. 실제 방문 수행 여부와는 별도입니다.":
    visitPending?"신청만으로 방문이 확정되지 않습니다. 집주인의 승인을 확인하세요.":
    "집주인이 공개한 가능 시간과 실제 신청 절차를 확인하세요.",
   actionLabel:visitConfirmed? "예약 내용 확인":"방문 요청 확인",
   target:"#room-visit-booking"},
  {key:"terms",title:"가격·생활 조건",
   status:termsOk?"app_confirmed":anyPending?"awaiting_both":"discussion",
   statusLabel:termsOk?"앱 내 양측 확인 기록":anyPending?"양측 확인 대기":"대화·확인 진행",
   detail:termsOk?
    "가격 등 현재 확인된 조건을 다시 검토하세요. 이 기록이 전자계약 체결을 의미하지는 않습니다.":
    "집톡이는 가격을 제안하거나 절충하지 않습니다. 같은 내용·버전에 두 사람이 각각 동의해야 확인됩니다.",
   actionLabel:"조건 확인 카드 열기",target:"#deal-condition-cards"},
  {key:"registry",title:"등기·계약 상대 권한",
   status:"unverified_external",statusLabel:"독립 확인 필요",
   detail:"게시자의 공유 요약을 보더라도 소유권·대리권, 현행·말소·신탁, 선순위 임차인과 세금은 공식 서류로 별도 검증해야 합니다.",
   actionLabel:"이 매물 권리 확인 안내",target:listingPath},
  {key:"legal_prep",title:"계약·잔금·인도 준비",
   status:"unverified_external",statusLabel:"계약 효력·송금 미확인",
   detail:"계약서 내용·신분/위임장·계좌·금전 지급·확정일자·전입·인도는 앱이 대신 완료하지 않습니다. 양측 확인 카드는 법적 계약서나 전자서명이 아닙니다.",
   actionLabel:"합의한 조건 확인",target:"#deal-condition-cards"},
 ];
}
