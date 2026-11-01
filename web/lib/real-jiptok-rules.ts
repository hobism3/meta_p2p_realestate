/**
 * Jiptok in REAL group rooms. Deterministic guidance; does not negotiate,
 * approve, make offers on anyone's behalf, or execute contracts.
 * Proposal candidates are never agreed until both human parties click agree.
 */
import {parseRentFields,formatRentBundle,formatJeonseDeposit} from "./rent.ts";
import {extractPriceManwon} from "./ziptalk.ts";
import type {TransactionSnapshot} from "./transaction-projection.ts";

export type RealGuideEvent=
 | {kind:"message";text:string;isOwner:boolean}
 | {kind:"proposal-created";name:string;value:string;status:string}
 | {kind:"proposal-decided";name:string;value:string;status:string}
 | {kind:"booking";status:string;date:string;time:string};
export type GuideDecision={
 text:string|null;
 /** room/topic is the natural dedupe key for non-proposal chatter. */
 topic:string;
 candidate?:{name:string;value:string};
};
function short(value:string,max=115):string {
 const v=value.trim().replace(/[\r\n\t]+/g," ");
 return v.length>max?v.slice(0,max)+"…":v;
}
const QUESTION= /[?？]|(?:되나요|될까요|가능한가|얼마나|어떨까요|궁금|알려주세요|문의|확인해주시|줄 수 있|될지)/;
const NEGATIVE=/(?:안됩니다|안 됩니다|어렵습니다|어렵겠|불가능|불가|취소|철회|거절|허용하지|안 돼요|안돼요|못합니다|안 할)/;
const OFFER=/(?:제안|가능합니다|가능해요|괜찮습니다|괜찮아요|좋겠습니다|좋겠어요|진행합시다|진행하죠|맞추겠습니다|맞춰드릴|하겠습니다|동의합니다|확정해요)/;
const PET=/(고양이|반려묘|반려동물|강아지|반려견)/;
const PET_ALLOW=/(허용|가능합니다|가능해요|괜찮습니다|괜찮아요|키워도 됩니다|키워도 돼요)/;
/** An explicit, unambiguous offer: candidate only, NEVER a consent. */
export function extractRealProposal(text:string,tradeType:string,isOwner:boolean):
  {name:string;value:string}|null {
 const raw=text.trim();
 if(!raw||QUESTION.test(raw)||NEGATIVE.test(raw)||!OFFER.test(raw))return null;
 if(isOwner && PET.test(raw) && PET_ALLOW.test(raw)){
   const pet=/(고양이|반려묘)/.test(raw)?"고양이":/(강아지|반려견)/.test(raw)?"강아지":"반려동물";
   const count=/한\s*마리|1\s*마리/.test(raw)?" 한 마리":"";
   // If both pet and price are present, price candidate takes precedence;
   // the pet information remains a separate unconfirmed conversation fact.
   const rent=parseRentFields(raw);
   if(!(tradeType==="월세"&&rent.deposit!==null&&rent.monthlyRent!==null))
     return {name:"옵션",value:`${pet}${count} 허용`};
 }
 if(tradeType==="월세"){
   const f=parseRentFields(raw);
   return f.deposit!==null&&f.monthlyRent!==null?
     {name:"월세 조건",value:formatRentBundle(f.deposit,f.monthlyRent)}:null;
 }
 if(tradeType==="전세"){
   if(!/전세|보증금/.test(raw))return null;
   const f=parseRentFields(raw);
   return f.deposit!==null?{name:"최종 전세보증금",value:formatJeonseDeposit(f.deposit)}:null;
 }
 if(tradeType==="매매"){
   if(!/(?:매매가|매매 가격|매매가격|매매금액|매매 금액)/.test(raw))return null;
   const amount=extractPriceManwon(raw);
   return amount!==null&&amount>0?{name:"최종 매매가",value:`${amount.toLocaleString()}만원`}:null;
 }
 return null;
}
function next(snapshot:TransactionSnapshot):string {
 return snapshot.nextStep.title;
}
export function decideRealJiptok(event:RealGuideEvent,snapshot:TransactionSnapshot):GuideDecision{
 if(snapshot.demo)return {text:null,topic:"demo-skip"};
 const visit=snapshot.stages.find(s=>s.key==="visit");
 const price=snapshot.stages.find(s=>s.key==="price");
 const living=snapshot.stages.find(s=>s.key==="living");
 if(event.kind==="proposal-created"){
   if(event.status!=="proposed")return {text:null,topic:"proposal-closed"};
   return {topic:"proposal",text:`${event.name}으로 '${short(event.value)}' 조건이 제안됐네요. 두 분 모두 아래 확인 카드에서 동의해야 기록됩니다. 대화만으로 확정되지는 않아요.`};
 }
 if(event.kind==="proposal-decided"){
   if(event.status==="agreed")
     return {topic:"agreed",text:`${event.name} '${short(event.value)}'에 두 분 모두 동의하셨어요. 거래 현황에 반영했어요. 다음으로 ${next(snapshot)}`};
   if(event.status==="refused")
     return {topic:"refused",text:`${event.name} 제안에 동의가 이뤄지지 않았어요. 새로운 조건이 있다면 두 분이 다시 확인 카드로 기록해 주세요.`};
   return {text:null,topic:"pending-consent"};
 }
 if(event.kind==="booking"){
   if(event.status==="confirmed")
     return {topic:"visit-confirmed",text:`${event.date} ${event.time} 방문 일정이 집주인 승인으로 확정됐어요. 방을 보신 후 가격과 반려동물·관리비 등 생활 조건도 확인해 보세요.`};
   if(event.status==="declined"||event.status==="cancelled")
     return {topic:"visit-cancelled",text:"방문 예약이 취소되거나 거절됐어요. 가능한 일정을 새로 선택해 집주인 확인을 받아 주세요."};
   // A room booking_notice already announces the pending booking.
   return {text:null,topic:"booking-pending"};
 }
 const text=event.text.trim();
 if(!text)return {text:null,topic:"empty"};
 const candidate=extractRealProposal(text,snapshot.tradeType,event.isOwner);
 if(candidate)return {topic:"offer",candidate,text:`${candidate.value} 조건이 대화에서 제안됐어요. 아래 카드에서 두 분이 각각 확인하시면 거래 현황에 반영할게요.`};
 if(PET.test(text)){
   if(living?.status==="partial"||living?.status==="pending")
     return {text:null,topic:"pets-already-pending"};
   return {topic:"pet-questions",text:"반려동물 얘기가 나왔네요. 허용 범위·마릿수처럼 중요한 생활 조건은 두 분이 확인 카드로 남겨 두면 좋아요. 집주인의 답변만으로는 최종 합의가 아니에요."};
 }
 if(/방\s*보고\s*왔|집\s*보고\s*왔|방문\s*했|집을\s*봤|방을\s*봤/.test(text)){
   return {topic:"after-viewing",text:price?.status==="confirmed"?"집을 보고 오셨군요. 관리비·반려동물·수리 조건까지 확인한 뒤 계약일을 정해 보세요.":"집을 보고 오셨군요. 가격 조건과 반려동물·관리비 등을 확인해 두면 좋아요. 금액은 두 분의 확인 카드로 확정해 주세요."};
 }
 if(/(?:계약일|계약서|가계약|특약)/.test(text)){
   return {topic:"contract-timing",text:price?.status!=="confirmed"?
     "계약 단계까지 생각하고 계시네요. 먼저 가격과 중요한 생활 조건을 두 분이 확인해 두세요. 계약일은 그다음에 정하면 좋아요.":
     "가격 조건이 확인됐어요. 두 분, 계약일은 언제로 하실까요? 계약금·잔금·입주 일정도 각자 확인 카드로 남겨 주세요."};
 }
 if(/(?:보증금|월세|전세가|매매가|가격)/.test(text)&&price?.status!=="confirmed"){
   if(price?.status==="pending")return {text:null,topic:"price-card-pending"};
   return {topic:"price-question",text:"가격 이야기가 나왔네요. 희망 금액과 실제 합의는 다르니, 최종 보증금·월세(또는 매매가)를 정하면 확인 카드에서 두 분이 각각 동의해 주세요."};
 }
 if(/(?:방문|보러|집\s*보)/.test(text)&&visit?.status!=="confirmed"&&visit?.status!=="pending"){
   return {topic:"viewing-question",text:"방문 날짜를 정하려면 등록된 가능 시간에서 신청해 주세요. 집주인이 승인한 뒤에만 방문이 확정돼요."};
 }
 // One-time onboarding is useful, but never interrupt every small-talk line.
 return {topic:"intro",text:"안녕하세요, 집톡이에요 ✦ 두 분이 얘기하실 때 방문·가격·생활 조건의 미확인 항목을 챙겨드릴게요. 제가 조건을 대신 합의하지는 않아요."};
}
