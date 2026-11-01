"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";

type Attention = {id:string;listing_id:string;listing_title:string;room_id:string;
 kind:string;question:string;status:string;created_at:string};
const labels:Record<string,string>={
 price_review:"가격·보증금 변경",visit_review:"방문 일정 승인",
 contract_review:"계약·권리관계",policy_review:"매물 정책 확인",other:"직접 답변 필요",
};
export default function OwnerAttentionPanel(){
 const [items,setItems]=useState<Attention[]>([]);
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  if(!getAccessToken()){setLoading(false);return;}
  try{
   const r=await fetch("/api/owner/requests",{headers:authHeaders(),cache:"no-store"});
   const body=await r.json();
   if(!r.ok)throw Error(body.error??"확인 요청 조회 실패");
   setItems(body);setError("");
  }catch(e){setError(e instanceof Error?e.message:"확인 요청 조회 실패");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
 const send=async(item:Attention)=>{
  const answer=(drafts[item.id]??"").trim();
  if(!answer){setError("집주인 답변을 입력해주세요.");return;}
  setBusy(item.id);setError("");
  try{
   const w=process.env.NEXT_PUBLIC_WRITE_TOKEN;
   const r=await fetch(`/api/owner/requests/${item.id}/answer`,{method:"POST",headers:{
    "Content-Type":"application/json",...(w?{"x-write-token":w}:{}),...authHeaders()},
    body:JSON.stringify({answer}),
   });
   const body=await r.json();
   if(!r.ok)throw Error(body.error??"전송 실패");
   setDrafts(d=>({...d,[item.id]:""}));
   await load();
  }catch(e){setError(e instanceof Error?e.message:"전송 실패");}
  finally{setBusy(null);}
 };
 const pending=items.filter(i=>i.status==="pending");
 return <section className="card owner-attention" aria-label="집주인 확인 요청">
  <div className="owner-attention-heading"><div><span className="eyebrow">OWNER ACTIONS</span>
   <h2>직접 확인할 문의 <span className="owner-attention-count">{pending.length}</span></h2></div>
   <button className="btn ghost" onClick={()=>void load()}>새로고침</button></div>
  <p className="meta">AI가 답변할 수 없는 금액 변경·계약·예약 요청은 여기에 모입니다. 여기에서 답하면 해당 거래방에 <strong>집주인 본인</strong>의 메시지로 전달됩니다. 현재 알림은 이 페이지 안에서만 제공됩니다.</p>
  {loading?<p role="status">확인 요청을 확인 중...</p>:pending.length===0?<p className="owner-attention-empty">새로운 확인 요청이 없습니다.</p>:
   <div className="owner-attention-list">{pending.map(item=><article className="owner-attention-item" key={item.id}>
    <div className="owner-attention-top"><strong>{item.listing_title}</strong><span>{labels[item.kind]??"집주인 확인"}</span></div>
    <p className="owner-question">{item.question}</p>
    <label htmlFor={"answer-"+item.id}>집주인 답변</label>
    <textarea id={"answer-"+item.id} rows={2} maxLength={2000} value={drafts[item.id]??""}
     onChange={e=>setDrafts(d=>({...d,[item.id]:e.target.value}))}
     placeholder="직접 확인한 사실이나 승인 여부를 구체적으로 남겨주세요."/>
    <div className="owner-attention-actions"><button className="btn" disabled={!!busy} onClick={()=>void send(item)}>{busy===item.id?"전송 중...":"집주인 답변 전송"}</button>
     <a className="btn ghost" href={`/rooms/${item.room_id}`}>거래방 확인 ↗</a></div>
   </article>)}</div>}
  {error?<p role="alert" className="owner-error">{error}</p>:null}
 </section>;
}
