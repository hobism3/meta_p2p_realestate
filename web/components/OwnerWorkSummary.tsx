"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";
type Row={listingId:string;listingTitle:string;visits:number;requests:number;aiFailures:number};
type Summary={total:number;visits:number;requests:number;aiFailures:number;byListing:Row[];note:string};
export default function OwnerWorkSummary(){
 const [data,setData]=useState<Summary|null>(null);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!getAccessToken())return;
  try{
   const response=await fetch("/api/owner/work-summary",{headers:authHeaders(),cache:"no-store"});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||"업무 현황을 불러오지 못했습니다.");
   setData(body as Summary);setError("");
  }catch(e){setError(e instanceof Error?e.message:"조회 실패");}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
 return <section className="card" aria-label="집주인 미처리 업무">
  <div className="owner-attention-heading"><div><span className="eyebrow">NEXT ACTIONS</span>
   <h2>지금 확인할 업무 {data?data.total:"…" }건</h2></div>
   <button type="button" className="btn ghost" onClick={()=>void load()}>새로고침</button></div>
  {error?<p role="alert">{error}</p>:null}
  {data?<><p>방문 승인 대기 {data.visits}건 · 직접 답변 {data.requests}건 · AI 응대 실패 {data.aiFailures}건</p>
   {data.total===0?<p>현재 확인이 필요한 업무가 없습니다.</p>:
    <div className="owner-list-grid">{data.byListing.map(row=><article key={row.listingId} className="card owner-list-card">
     <h3>{row.listingTitle}</h3>
     <p>방문 {row.visits}건 · 문의 {row.requests}건 · 응대 실패 {row.aiFailures}건</p>
     <a className="btn ghost" href={row.visits?"/owner#owner-visits":"/owner#owner-attention"}>아래 관리 화면에서 확인 ↓</a>
    </article>)}</div>}
   <p className="meta">{data.note}</p>
  </>:!error?<p role="status">업무 현황을 확인하는 중...</p>:null}
 </section>;
}
