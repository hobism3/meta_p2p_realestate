/**
 * Transaction status is a projection of persisted facts, never an AI guess.
 * The caller MUST authorize room membership before fetching room-scoped rows.
 */
export type TransactionStatus="confirmed"|"partial"|"pending"|"discussing"|"not-started";
export type TransactionStageKey="visit"|"price"|"living"|"contract"|"earnest"|"handover";
export type TransactionStage={
 key:TransactionStageKey;label:string;status:TransactionStatus;
 confirmedValue:string|null;pendingValue:string|null;detail:string;
 evidence:string[];confirmedProposalId:string|null;pendingProposalId:string|null;
};
export type TransactionSnapshot={
 tradeType:string;demo:boolean;stages:TransactionStage[];
 nextStep:{key:TransactionStageKey;title:string;hint:string};
 confirmedCount:number;
};
export type RawProposal={
 id:string;name:string;value:string;version:number;status:string;
 source_msg_ids?:string[];
};
export type RawCondition={name:string;value:string;source_msg_ids?:string};
export type RawBooking={visit_date:string;visit_time:string;status:string;created_at?:string};
export type RawVisit={visit_date:string;visit_time:string;status:string;created_at?:string};
export type RawChat={text:string;author_type?:string};
export type ProjectionInput={
 tradeType:string;demo:boolean;proposals:RawProposal[];conditions:RawCondition[];
 bookings:RawBooking[];visits:RawVisit[];chat:RawChat[];
};
type ProposalView={current?:RawProposal;pending?:RawProposal;confirmed?:RawProposal};
const byNewest=(a:RawProposal,b:RawProposal)=>b.version-a.version;
function proposalsFor(all:RawProposal[],name:string):ProposalView {
 const rows=all.filter(p=>p.name===name).sort(byNewest);
 return {current:rows[0],pending:rows.find(p=>p.status==="proposed"),
         confirmed:rows.find(p=>p.status==="agreed")};
}
function evidence(p?:RawProposal,cond?:RawCondition):string[]{
 return Array.from(new Set([...(p?.source_msg_ids??[]),...(cond?.source_msg_ids??[])])).filter(x=>typeof x==="string");
}
function term(input:ProjectionInput,key:TransactionStageKey,label:string,name:string):TransactionStage {
 const q=proposalsFor(input.proposals,name);
 const c=input.conditions.find(x=>x.name===name&&x.value);
 const newerPending=q.pending && (!q.confirmed||q.pending.version>q.confirmed.version)?q.pending:undefined;
 let status:TransactionStatus="not-started",detail="아직 확인하지 않았어요.";
 if(q.confirmed){
   status=newerPending?"pending":"confirmed";
   detail=newerPending?"기존 양측 동의는 유지되고 변경 제안이 확인 대기 중이에요.":"양측이 동일한 버전에 동의했어요.";
 }else if(q.pending){status="pending";detail="한쪽 제안은 합의가 아니에요. 양측 확인이 필요해요.";}
 else if(c){status="discussing";detail="대화에서 나온 조건이며 양측 확정은 아니에요.";}
 return {
   key,label,status,confirmedValue:q.confirmed?.value??null,
   pendingValue:newerPending?.value??(!q.confirmed?q.pending?.value??c?.value??null:null),
   detail,evidence:evidence(newerPending??q.confirmed??q.pending,c),
   confirmedProposalId:q.confirmed?.id??null,pendingProposalId:newerPending?.id??(!q.confirmed?q.pending?.id??null:null),
 };
}
function latest<T extends {created_at?:string}>(rows:T[]):T|undefined {
 return [...rows].sort((a,b)=>String(b.created_at??"").localeCompare(String(a.created_at??"")))[0];
}
function localVisit(v:{visit_date:string;visit_time:string}):string {
 return `${v.visit_date} ${v.visit_time} (한국 시간)`;
}
export function buildTransactionSnapshot(input:ProjectionInput):TransactionSnapshot {
 const type=input.tradeType;
 const priceName=type==="매매"?"최종 매매가":type==="전세"?"최종 전세보증금":"월세 조건";
 const price=term(input,"price","가격 조건",priceName);
 let visit:TransactionStage={key:"visit",label:"집 확인·방문",status:"not-started",
  confirmedValue:null,pendingValue:null,detail:"방문 일정이 정해지지 않았어요.",
  evidence:[],confirmedProposalId:null,pendingProposalId:null};
 if(!input.demo){
   // Actual booking status is the ONLY source of a real appointment.
   const confirmed=latest(input.bookings.filter(b=>b.status==="confirmed"));
   const requested=latest(input.bookings.filter(b=>b.status==="requested"));
   if(confirmed){visit={...visit,status:"confirmed",confirmedValue:localVisit(confirmed),detail:"집주인이 실제 예약을 승인했어요."};}
   else if(requested){visit={...visit,status:"pending",pendingValue:localVisit(requested),detail:"집주인 승인 대기 중이며 아직 방문 확정이 아니에요."};}
   else if(input.bookings.some(b=>b.status==="expired"))visit={...visit,detail:"기존 방문 신청이 만료됐어요. 새 일정을 신청하세요."};
   else if(input.bookings.some(b=>b.status==="cancelled"||b.status==="declined"))visit={...visit,detail:"기존 방문 예약이 취소되거나 거절됐어요. 새 일정을 신청하세요."};
 }else{
   const confirmed=latest(input.visits.filter(v=>v.status==="수락됨"));
   const pending=latest(input.visits.filter(v=>v.status==="제안됨"));
   if(confirmed)visit={...visit,status:"confirmed",confirmedValue:localVisit(confirmed),detail:"시연 거래에서 방문 날짜가 확인됐어요. 실제 예약이 아니에요."};
   else if(pending)visit={...visit,status:"pending",pendingValue:localVisit(pending),detail:"시연 방문 제안 상태예요."};
   else {
     const p=proposalsFor(input.proposals,"방문일");
     if(p.confirmed)visit={...visit,status:"confirmed",confirmedValue:p.confirmed.value,detail:"시연 양측 방문 동의예요. 실제 예약은 아니에요."};
     else if(p.pending)visit={...visit,status:"pending",pendingValue:p.pending.value,detail:"시연 방문 제안 확인 대기예요."};
   }
 }
 const names=["옵션","관리비","수리 요청"];
 const sub=names.map(name=>term(input,"living","생활 조건",name));
 const agreed=sub.filter(v=>v.confirmedValue);
 const waiting=sub.filter(v=>v.pendingProposalId);
 const hasPetTalk=input.chat.some(m=>m.author_type==="human"&&/고양이|강아지|반려동물|반려묘|반려견|관리비|수리|옵션/.test(m.text));
 const living:TransactionStage={key:"living",label:"옵션·생활 조건",
  status:waiting.length?"pending":agreed.length?"partial":hasPetTalk?"discussing":"not-started",
  confirmedValue:agreed.length?agreed.map(v=>v.label==="생활 조건"?`${names[sub.indexOf(v)]}: ${v.confirmedValue}`:v.confirmedValue).join(" · "):null,
  pendingValue:waiting.length?waiting.map(v=>`${names[sub.indexOf(v)]}: ${v.pendingValue}`).join(" · "):null,
  detail:waiting.length?"생활 조건 제안의 양측 확인이 필요해요.":agreed.length?"일부 생활 조건에 양측이 동의했어요. 다른 옵션·관리비도 확인하세요.":hasPetTalk?"대화에 생활 조건이 나왔지만 아직 확인 카드로 확정되지 않았어요.":"반려동물·관리비·수리 조건을 확인하세요.",
  evidence:Array.from(new Set(sub.flatMap(v=>v.evidence))),
  confirmedProposalId:null,pendingProposalId:waiting[0]?.pendingProposalId??null,
 };
 const contract=term(input,"contract",type==="매매"?"계약·가계약 여부":"계약일","계약일");
 const earnest=term(input,"earnest","계약금","계약금");
 const balance=term(input,"handover","잔금·인도/입주","잔금일");
 const other=term(input,"handover","잔금·인도/입주",type==="매매"?"인도일":"입주일");
 const handover:TransactionStage={key:"handover",label:"잔금·인도/입주",
   status:balance.confirmedValue&&other.confirmedValue?"confirmed":
     balance.pendingProposalId||other.pendingProposalId?"pending":
     balance.confirmedValue||other.confirmedValue?"partial":
     balance.pendingValue||other.pendingValue?"discussing":"not-started",
   confirmedValue:[balance.confirmedValue&&`잔금일: ${balance.confirmedValue}`,other.confirmedValue&&`${type==="매매"?"인도일":"입주일"}: ${other.confirmedValue}`].filter(Boolean).join(" · ")||null,
   pendingValue:[balance.pendingValue&&`잔금일: ${balance.pendingValue}`,other.pendingValue&&`인도/입주일: ${other.pendingValue}`].filter(Boolean).join(" · ")||null,
   detail:"잔금 지급 시점과 실제 인도·입주일을 각각 양측이 확인해야 해요.",
   evidence:Array.from(new Set([...balance.evidence,...other.evidence])),
   confirmedProposalId:null,pendingProposalId:balance.pendingProposalId??other.pendingProposalId,
 };
 const stages=[visit,price,living,contract,earnest,handover];
 const next=stages.find(s=>s.status==="pending")??stages.find(s=>s.status!=="confirmed"&&s.status!=="partial")??stages.find(s=>s.status==="partial")??handover;
 const titles:Record<TransactionStageKey,string>={
  visit:"방문 가능한 시간을 확인할까요?",price:"가격 조건을 두 분이 확인해 주세요.",
  living:"생활 조건도 확인해 둘까요?",contract:"계약일은 언제로 하실까요?",
  earnest:"계약금과 지급 시점을 확인해 주세요.",handover:"잔금·입주 일정을 확인해 주세요.",
 };
 return {tradeType:type,demo:input.demo,stages,
   nextStep:{key:next.key,title:titles[next.key],hint:next.detail},
   confirmedCount:stages.filter(s=>s.status==="confirmed").length};
}
