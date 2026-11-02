"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {authHeaders} from "../lib/client-auth";
import {decideProposal,loadProposals,type ProposalsData} from "../lib/store";
import type {TransactionSnapshot,TransactionStageKey,TransactionStatus} from "../lib/transaction-projection";
import {buildCompanionTasks} from "../lib/jiptok-support-tasks";
import {buildTransactionJourney} from "../lib/transaction-journey";
import {useUiLocale} from "../lib/ui-locale";

const EN_STATUS:Record<TransactionStatus,string>={confirmed:"Confirmed",partial:"Partially confirmed",pending:"Awaiting approval",discussing:"In discussion","not-started":"Not started"};
const EN_STAGE:Record<string,string>={visit:"Visit & inspection",price:"Price",living:"Amenities & living terms",contract:"Contract date",earnest:"Earnest money",handover:"Final payment & move-in"};
const EN_NEXT:Record<string,string>={
 visit:"Set a visit date",price:"Ask both parties to confirm the price terms",living:"Check lifestyle and amenity terms",
 contract:"Confirm a contract date",earnest:"Confirm the initial payment",handover:"Confirm final payment and move-in",
};
const statuses:Record<TransactionStatus,string>={
 confirmed:"양측 확인",partial:"일부 확인",pending:"동의 대기",
 discussing:"대화 중", "not-started":"미정",
};
const typeOptions:Record<string,string[]>={
 월세:["월세 조건","옵션","관리비","수리 요청","계약일","계약금","잔금일","입주일"],
 전세:["최종 전세보증금","옵션","관리비","수리 요청","계약일","계약금","잔금일","입주일"],
 매매:["최종 매매가","옵션","수리 요청","계약일","계약금","잔금일","인도일"],
};
function stageSymbol(status:TransactionStatus):string {
 return status==="confirmed"?"✓":status==="pending"?"!":status==="partial"?"◐":"·";
}
function headers():Record<string,string>{
 const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
 return {"Content-Type":"application/json",...(token?{"x-write-token":token}:{}) ,...authHeaders()};
}
export default function TransactionProgressPanel({rid,tradeType,listingId="",revision=0,onUpdated}:{
 rid:string;tradeType:string;listingId?:string;revision?:number;onUpdated?:()=>void;
}){
 const {tr,en}=useUiLocale();
 const stageLabel=(key:string,text:string)=>en?(EN_STAGE[key]??text):text;
 const nextTitle=(key:string,text:string)=>en?(EN_NEXT[key]??text):text;
 const [summary,setSummary]=useState<TransactionSnapshot|null>(null);
 const [proposalData,setProposalData]=useState<ProposalsData|null>(null);
 const [name,setName]=useState("");
 const [value,setValue]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const options=useMemo(()=>typeOptions[tradeType]??typeOptions["월세"],[tradeType]);
 const chosen=name||options[0];
 const companion=useMemo(()=>summary?buildCompanionTasks(summary,4,listingId):[],[summary,listingId]);
 const journey=useMemo(()=>summary?buildTransactionJourney(summary,listingId):[],[summary,listingId]);
 const refresh=useCallback(async()=>{
  try{
   const [res,proposals]=await Promise.all([
    fetch(`/api/rooms/${encodeURIComponent(rid)}/transaction-state`,{headers:authHeaders(),cache:"no-store"}),
    loadProposals(rid),
   ]);
   const body=await res.json();
   if(!res.ok)throw Error(body.error??"거래 진행 상태 조회 실패");
   setSummary(body);setProposalData(proposals);setError("");
  }catch(e){setSummary(null);setProposalData(null);setError(e instanceof Error?e.message:"거래 현황 조회 실패");}
  finally{setLoading(false);}
 },[rid]);
 useEffect(()=>{void refresh();const t=setInterval(()=>void refresh(),10000);return()=>clearInterval(t);},[refresh,revision]);
 const propose=async()=>{
  if(!value.trim()||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch(`/api/rooms/${rid}/proposals/create`,{method:"POST",headers:headers(),
     body:JSON.stringify({name:chosen,value:value.trim()})});
   const body=await res.json();
   if(!res.ok)throw Error(body.error??"조건 제안 실패");
   setNotice("확인 카드를 만들었습니다. 두 사람 각각 동의해야 조건이 확정됩니다.");
   setValue("");
   await refresh();onUpdated?.();
  }catch(e){setError(e instanceof Error?e.message:"조건 제안 실패");}
  finally{setBusy(false);}
 };
 const decide=async(id:string,decision:"agree"|"refuse",version:number)=>{
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const res=await decideProposal(rid,id,decision,version);
   setNotice(res.status==="agreed"?"두 분 모두 동의해 최종 조건으로 기록됐습니다.":
     decision==="refuse"?"동의하지 않는 것으로 기록했습니다.":"동의를 기록했습니다. 상대방 확인을 기다립니다.");
   await refresh();onUpdated?.();
  }catch(e){setError(e instanceof Error?e.message:"확인 실패");}
  finally{setBusy(false);}
 };
 if(loading)return <section className="real-transaction-summary" role="region" aria-label={tr("거래 진행 요약","Deal progress")}><p role="status">{tr("거래 현황을 불러오고 있습니다.","Loading transaction status...")}</p></section>;
 return <section className="real-transaction-summary" role="region" aria-label={tr("거래 진행 요약","Deal progress")}>
  <div className="real-progress-head"><div><span className="eyebrow">LIVE DEAL CHECKLIST</span>
   <h3>{tr("두 사람의 거래 진행","Your deal at a glance")}</h3></div>
   <button type="button" className="btn ghost" onClick={()=>void refresh()}>{tr("현황 새로고침","Refresh status")}</button>
  </div>
  <p className="meta">{tr("이 화면은 당사자가 입력한 조건의 플랫폼 내 확인 이력입니다. 실제 채팅·동의 표현의 법적 의미는 별도 확인해야 합니다.","This is the platform's record of user-entered terms. It does not create a legal contract. Visit bookings require owner approval.")}</p>
  {summary?<><section id="jiptok-digest" className="jiptok-digest" aria-label={tr("집톡이 한눈에 정리","Jiptok summary")}>
   <header className="jiptok-digest-header">
    <div className="jiptok-digest-avatar" aria-hidden="true">⌂<span>✦</span></div>
    <div>
     <span className="eyebrow">JIPTOK · DEAL COMPANION</span>
     <h3>{tr("집톡이가 지금까지 정리했어요","Jiptok's deal summary")}</h3>
     <p>{tr("두 사람의 대화와 실제 확인 기록을 바탕으로 중요한 내용만 모았어요.","Key details from the actual conversation and confirmation history.")}</p>
    </div>
    <span className="jiptok-digest-live"><i aria-hidden="true" /> {tr("최신 확인 기록","Updated from deal records")}</span>
   </header>
   <div className="jiptok-digest-metrics" aria-label={tr("확인된 항목과 확인 대기 항목","Confirmed and pending items")}>
    <div><strong>{summary.stages.filter(s=>s.status==="confirmed").length}</strong><span>{tr("앱 내 확인 항목","Verified in app")}</span></div>
    <div><strong>{summary.stages.filter(s=>s.status==="pending"||s.status==="partial").length}</strong><span>{tr("확인 대기","Awaiting review")}</span></div>
    <div><strong>{summary.stages.filter(s=>s.status==="discussing").length}</strong><span>{tr("논의 중","In discussion")}</span></div>
   </div>
   <div className="jiptok-digest-columns">
    <div className="jiptok-digest-list">
     <h4><span aria-hidden="true">✓</span> {tr("확인된 내용","Confirmed items")}</h4>
     {summary.stages.filter(s=>s.status==="confirmed" && s.confirmedValue).length?
      summary.stages.filter(s=>s.status==="confirmed" && s.confirmedValue).slice(0,3).map(step=>
       <p key={step.key}><strong>{stageLabel(step.key,step.label)}</strong><span>{step.confirmedValue}</span></p>):
      <p className="jiptok-digest-empty">{tr("아직 앱에서 확인 완료로 기록된 조건이 없어요.","No completed confirmations have been recorded yet.")}</p>}
    </div>
    <div className="jiptok-digest-list">
     <h4><span aria-hidden="true">◐</span> {tr("아직 확인할 내용","Still to confirm")}</h4>
     {summary.stages.filter(s=>s.status!=="confirmed" && s.pendingValue).length?
      summary.stages.filter(s=>s.status!=="confirmed" && s.pendingValue).slice(0,3).map(step=>
       <p key={step.key}><strong>{stageLabel(step.key,step.label)}</strong><span>{step.pendingValue}</span></p>):
      <p className="jiptok-digest-empty">{tr("현재 기록된 미확인 제안은 없어요. 진행 순서에서 남은 절차를 확인해 주세요.","No pending proposals. Review the remaining steps.")}</p>}
    </div>
   </div>
   <div className="jiptok-digest-next">
    <div><span className="eyebrow">WHAT'S NEXT</span>
     <strong>{en?"Next: "+nextTitle(summary.nextStep.key,summary.nextStep.title):"다음은 ‘"+summary.nextStep.title+"’을 확인해 주세요."}</strong>
     <p>{en?"Review the proposal details and obtain the required human approval.":summary.nextStep.hint}</p>
    </div>
    <a href="#deal-condition-cards" className="btn">{tr("조건 확인 카드 보기 ↓","See confirmation cards ↓")}</a>
   </div>
   <p className="jiptok-digest-disclaimer">{tr("집톡이는 제안·대기·완료 상태를 정리할 뿐 협상하거나 동의를 대신하지 않아요. ‘확인 완료’는 앱에 기록된 확인 상태이며 법적 계약 체결을 의미하지 않습니다.","Jiptok organizes proposals, pending items and completed checks. It never negotiates or consents for you. In-app confirmation is not a legally binding contract.")}</p>
  </section><section className="card" aria-label={tr("지금부터 계약 준비까지의 진행 순서","Deal progress and next steps")} style={{margin:"12px 0 16px"}}>
   <span className="eyebrow">YOUR NEXT STEPS</span><h3>{tr("집톡이가 챙기는 다음 단계","Next steps, tracked by Jiptok")}</h3>
   <p className="meta">{tr("저장된 방문 승인과 양측 확인 카드만 실제 앱 진행에 반영합니다. 권리 확인·법적 계약·송금 완료는 자동으로 체크하지 않습니다.","Only recorded visit approvals and mutual confirmations change deal status. Legal rights, contracts and payments are not auto-verified.")}</p>
   <div className="real-progress-grid">
    {journey.map((step,index)=><article className={"real-stage is-"+(step.status==="app_confirmed"?"confirmed":step.status==="awaiting_both"?"pending":"not-started")} key={step.key}>
     <span className="real-stage-number">{step.status==="app_confirmed"?"✓":step.status==="awaiting_both"?"◐":index+1}</span>
     <div className="real-stage-body">
      <strong>{step.title}</strong>
      <small>{en?(step.status==="app_confirmed"?"In-app confirmed":step.status==="awaiting_both"?"Awaiting both":"To review"):step.statusLabel}</small>
      <p>{en?("Review the recorded "+(EN_STAGE[step.key]??"deal")+" evidence and next action."):step.detail}</p>
      {step.target&&step.actionLabel?<a href={step.target}>{step.actionLabel} ↗</a>:null}
     </div>
    </article>)}
   </div>
  </section><div className="real-progress-grid">
   {summary.stages.map((step,index)=><div key={step.key} className={"real-stage is-"+step.status}>
    <span className="real-stage-number">{stageSymbol(step.status)}</span>
    <div className="real-stage-body"><strong>{index+1}. {stageLabel(step.key,step.label)}</strong>
     <small>{en?EN_STATUS[step.status]:statuses[step.status]}</small>
     {step.confirmedValue?<p><b>{tr("확인:","Confirmed:")}</b> {step.confirmedValue}</p>:null}
     {step.pendingValue?<p className="real-pending-value"><b>{tr("확인 전:","Not confirmed:")}</b> {step.pendingValue}</p>:null}
     {!step.confirmedValue&&!step.pendingValue?<p>{en?("Review the recorded "+(EN_STAGE[step.key]??"deal")+" evidence and next action."):step.detail}</p>:null}
     {step.evidence.length?<a href={"#msg-"+step.evidence[0]}>{tr("대화 근거 ↗","View source message ↗")}</a>:null}
    </div>
   </div>)}
  </div><p className="real-next-step"><strong>다음 확인:</strong> {nextTitle(summary.nextStep.key,summary.nextStep.title)} <span>{en?"Review the proposal details and obtain the required human approval.":summary.nextStep.hint}</span></p>
  <aside className="card" aria-label={tr("집톡이의 남은 확인사항","Unresolved items tracked by Jiptok")} style={{marginTop:16}}>
   <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
    <span aria-hidden="true">🏠</span><strong>{tr("집톡이가 챙긴 확인사항","Jiptok's remaining checklist")}</strong>
    <small className="meta">거래 현황에서 자동 정리 · 협상하거나 대신 확정하지 않음</small>
   </div>
   <p className="meta">{tr("사람이 직접 결정·승인한 사실만 거래 상태에 반영합니다. 아래는 다음에 확인할 자료와 대기사항을 안내하는 읽기 전용 메모입니다.","Only human-confirmed facts change deal status. These notes are read-only reminders of what to check.")}</p>
   <div style={{display:"grid",gap:10}}>
    {companion.map(task=><div className="card" key={task.id} style={{margin:0}}>
     <strong>{task.title}</strong>
     <p className="meta">{task.description}</p>
     {task.target&&task.actionLabel?<a className="btn ghost" href={task.target}>{task.actionLabel} ↗</a>:null}
    </div>)}
   </div>
   {summary.demo?<p className="meta">{tr("시연방의 확인과 일정은 실제 임대인의 승인이나 실제 계약이 아닙니다.","Demo approvals and appointments are not real consent or a legal contract.")}</p>:null}
  </aside></>:null}
  {proposalData?<div className="real-active-proposals" id="deal-condition-cards">
   <strong>{tr("두 사람의 조건 확인 카드","Mutual term confirmation cards")}</strong>
   {proposalData.proposals.filter(p=>p.status==="proposed"||p.status==="agreed").slice(-8).reverse().map(p=>{
    const approvals=proposalData.approvals[p.id]??[];
    const mine=approvals.find(a=>a.actor_id===proposalData.me);
    return <article className={"real-proposal-card is-"+p.status} key={p.id}>
     <div className="real-proposal-head"><strong>{tr(p.name,( {"월세 조건":"Rent & deposit","최종 매매가":"Final sale price","최종 전세보증금":"Final jeonse deposit","관리비":"Monthly fee","옵션":"Amenities","계약일":"Contract date","입주일":"Move-in date"} as Record<string,string>)[p.name]??p.name)}</strong><span>{p.status==="agreed"?"✓ 양측 동의":"제안 · 양측 확인 대기"}</span></div>
     <p className="real-proposal-value">{p.value}</p>
     <small>{p.status==="agreed"?"완료 · 동일 조건 버전에서 양측 동의":
      `동의 ${approvals.filter(a=>a.decision==="agree").length}/2명 · ${mine?mine.decision==="agree"?"내가 동의함":"내가 거절함":"내 확인 필요"}`}</small>
     {p.status==="proposed"&&!mine?<div className="owner-booking-actions">
      <button type="button" className="btn" disabled={busy} onClick={()=>void decide(p.id,"agree",p.version)}>{tr("이 조건 동의","Agree to these terms")}</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={()=>void decide(p.id,"refuse",p.version)}>{tr("거절","Decline")}</button>
     </div>:null}
    </article>;
   })}
   <details className="real-propose-details">
    <summary>{tr("+ 새로운 조건 확인 요청 만들기","+ Request a new confirmation")}</summary>
    <p className="meta">{tr("가격을 절충하거나 계약을 자동 체결하지 않습니다. 양측이 확인할 구체적인 조건을 입력하세요.","Jiptok does not negotiate or sign contracts. Enter the specific terms you want both people to review.")}</p>
    <label>확인할 항목
     <select value={chosen} onChange={e=>setName(e.target.value)}>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>
    </label>
    <label>{tr("조건 내용","Proposed terms")}<input value={value} maxLength={500} onChange={e=>setValue(e.target.value)}
     placeholder={chosen==="월세 조건"?"예: 보증금 3,000만원/월세 68만원":"조건을 구체적으로 입력"}/></label>
    <button type="button" className="btn" disabled={busy||!value.trim()} onClick={()=>void propose()}>
     {busy?"처리 중...":"확인 카드 만들기"}</button>
   </details>
  </div>:null}
  {error?<p className="owner-error" role="alert">{error}</p>:null}
  {notice?<p className="owner-success" role="status">{notice}</p>:null}
 </section>;
}
