"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";
type Row={listingId:string;listingTitle:string;visits:number;requests:number;aiFailures:number;visitRoomId?:string;requestRoomId?:string;failedRoomId?:string};
type Action={id:string;kind:"visit"|"request"|"failed";listingId:string;listingTitle:string;roomId:string;label:string};
type Summary={actions:Action[];total:number;visits:number;requests:number;aiFailures:number;byListing:Row[];note:string};
export default function OwnerWorkSummary(){
 const [data,setData]=useState<Summary|null>(null);
 const [error,setError]=useState("");
 const [kind,setKind]=useState<"all"|"visit"|"request"|"failed">("all");
 const [listing,setListing]=useState("all");
 const filtered=data?.actions.filter(a=>(kind==="all"||a.kind===kind)&&(listing==="all"||a.listingId===listing))??[];
 const load=useCallback(async()=>{
  if(!getAccessToken())return;
  try{
   const response=await fetch("/api/owner/work-summary",{headers:authHeaders(),cache:"no-store"});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||"업무 현황을 불러오지 못했습니다.");
   setData(body as Summary);setError("");
  }catch(e){setData(null);setError(e instanceof Error?e.message:"조회 실패");}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
 return <section className="card" aria-label="집주인 미처리 업무">
  <div className="owner-attention-heading"><div><span className="eyebrow">NEXT ACTIONS</span>
   <h2>지금 확인할 업무 {data?data.total:"…" }건</h2></div>
   <button type="button" className="btn ghost" onClick={()=>void load()}>새로고침</button></div>
  {error?<p role="alert">{error}</p>:null}
  {data?<><p>방문 승인 대기 {data.visits}건 · 직접 답변 {data.requests}건 · AI 응대 실패 {data.aiFailures}건</p>
   {data.total===0?<p>현재 확인이 필요한 업무가 없습니다.</p>:null}
   {data.total>0?<div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:16}}><label>업무 종류 <select aria-label="업무 종류" value={kind} onChange={e=>setKind(e.target.value as "all"|"visit"|"request"|"failed")}><option value="all">전체</option><option value="visit">방문 승인</option><option value="request">직접 답변</option><option value="failed">AI 응대 실패</option></select></label><label>매물 <select aria-label="업무 매물" value={listing} onChange={e=>setListing(e.target.value)}><option value="all">모든 매물</option>{data.byListing.map(row=><option key={row.listingId} value={row.listingId}>{row.listingTitle}</option>)}</select></label></div>:null}
   {data.total>0?<p role="status">조건에 맞는 업무 {filtered.length}건</p>:null}
   {data.total>0&&filtered.length===0?<p className="owner-attention-empty">선택한 조건에 해당하는 업무가 없습니다.</p>:null}
   <div className="owner-attention-list">{filtered.map(action=><article className="owner-attention-item" key={action.kind+":"+action.id}><div className="owner-attention-top"><strong>{action.listingTitle}</strong><span>{action.label}</span></div><a className="btn ghost" href={`/rooms/${encodeURIComponent(action.roomId)}`}>거래방 열기 ↗</a>{action.kind==="visit"?<a className="btn ghost" href="#owner-visits">방문 승인 화면 ↓</a>:<a className="btn ghost" href="#owner-attention">확인 요청 화면 ↓</a>}</article>)}</div>
   <p className="meta">{data.note} 거래방 이동만으로 요청이 승인되거나 답변이 전송되지는 않습니다.</p>
  </>:!error?<p role="status">업무 현황을 확인하는 중...</p>:null}
 </section>;
}
