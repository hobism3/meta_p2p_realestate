"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {authHeaders} from "../lib/client-auth";
import {decideProposal,loadProposals,type ProposalsData} from "../lib/store";
import type {TransactionSnapshot,TransactionStageKey,TransactionStatus} from "../lib/transaction-projection";

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
export default function TransactionProgressPanel({rid,tradeType,revision=0,onUpdated}:{
 rid:string;tradeType:string;revision?:number;onUpdated?:()=>void;
}){
 const [summary,setSummary]=useState<TransactionSnapshot|null>(null);
 const [proposalData,setProposalData]=useState<ProposalsData|null>(null);
 const [name,setName]=useState("");
 const [value,setValue]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const options=useMemo(()=>typeOptions[tradeType]??typeOptions["월세"],[tradeType]);
 const chosen=name||options[0];
 const refresh=useCallback(async()=>{
  try{
   const [res,proposals]=await Promise.all([
    fetch(`/api/rooms/${encodeURIComponent(rid)}/transaction-state`,{headers:authHeaders(),cache:"no-store"}),
    loadProposals(rid),
   ]);
   const body=await res.json();
   if(!res.ok)throw Error(body.error??"거래 진행 상태 조회 실패");
   setSummary(body);setProposalData(proposals);setError("");
  }catch(e){setError(e instanceof Error?e.message:"거래 현황 조회 실패");}
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
 if(loading)return <section className="real-transaction-summary" role="region" aria-label="거래 진행 요약"><p role="status">거래 현황을 불러오고 있습니다.</p></section>;
 return <section className="real-transaction-summary" role="region" aria-label="거래 진행 요약">
  <div className="real-progress-head"><div><span className="eyebrow">LIVE DEAL CHECKLIST</span>
   <h3>두 사람의 거래 진행</h3></div>
   <button type="button" className="btn ghost" onClick={()=>void refresh()}>현황 새로고침</button>
  </div>
  <p className="meta">실제 방문은 집주인 승인, 거래 조건은 양측 동일 버전 동의만 확정으로 표시합니다. AI 발언이나 한 사람의 제안만으로 확정하지 않습니다.</p>
  {summary?<><div className="real-progress-grid">
   {summary.stages.map((step,index)=><div key={step.key} className={"real-stage is-"+step.status}>
    <span className="real-stage-number">{stageSymbol(step.status)}</span>
    <div className="real-stage-body"><strong>{index+1}. {step.label}</strong>
     <small>{statuses[step.status]}</small>
     {step.confirmedValue?<p><b>확인:</b> {step.confirmedValue}</p>:null}
     {step.pendingValue?<p className="real-pending-value"><b>확인 전:</b> {step.pendingValue}</p>:null}
     {!step.confirmedValue&&!step.pendingValue?<p>{step.detail}</p>:null}
     {step.evidence.length?<a href={"#msg-"+step.evidence[0]}>대화 근거 ↗</a>:null}
    </div>
   </div>)}
  </div><p className="real-next-step"><strong>다음 확인:</strong> {summary.nextStep.title} <span>{summary.nextStep.hint}</span></p></>:null}
  {proposalData?<div className="real-active-proposals">
   <strong>두 사람의 조건 확인 카드</strong>
   {proposalData.proposals.filter(p=>p.status==="proposed"||p.status==="agreed").slice(-8).reverse().map(p=>{
    const approvals=proposalData.approvals[p.id]??[];
    const mine=approvals.find(a=>a.actor_id===proposalData.me);
    return <article className={"real-proposal-card is-"+p.status} key={p.id}>
     <div className="real-proposal-head"><strong>{p.name}</strong><span>{p.status==="agreed"?"✓ 양측 동의":"제안 · 양측 확인 대기"}</span></div>
     <p className="real-proposal-value">{p.value}</p>
     <small>{p.status==="agreed"?"완료 · 동일 조건 버전에서 양측 동의":
      `동의 ${approvals.filter(a=>a.decision==="agree").length}/2명 · ${mine?mine.decision==="agree"?"내가 동의함":"내가 거절함":"내 확인 필요"}`}</small>
     {p.status==="proposed"&&!mine?<div className="owner-booking-actions">
      <button type="button" className="btn" disabled={busy} onClick={()=>void decide(p.id,"agree",p.version)}>이 조건 동의</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={()=>void decide(p.id,"refuse",p.version)}>거절</button>
     </div>:null}
    </article>;
   })}
   <details className="real-propose-details">
    <summary>+ 새로운 조건 확인 요청 만들기</summary>
    <p className="meta">가격을 절충하거나 계약을 자동 체결하지 않습니다. 양측이 확인할 구체적인 조건을 입력하세요.</p>
    <label>확인할 항목
     <select value={chosen} onChange={e=>setName(e.target.value)}>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>
    </label>
    <label>조건 내용<input value={value} maxLength={500} onChange={e=>setValue(e.target.value)}
     placeholder={chosen==="월세 조건"?"예: 보증금 3,000만원/월세 68만원":"조건을 구체적으로 입력"}/></label>
    <button type="button" className="btn" disabled={busy||!value.trim()} onClick={()=>void propose()}>
     {busy?"처리 중...":"확인 카드 만들기"}</button>
   </details>
  </div>:null}
  {error?<p className="owner-error" role="alert">{error}</p>:null}
  {notice?<p className="owner-success" role="status">{notice}</p>:null}
 </section>;
}
