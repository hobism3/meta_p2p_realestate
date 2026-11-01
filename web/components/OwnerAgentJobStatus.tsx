"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders} from "../lib/client-auth";
type Job={id:string;status:"pending"|"processing"|"completed"|"disabled"|"failed";attempts:number;last_error:string;available_at:string};
export default function OwnerAgentJobStatus({rid,revision}:{rid:string;revision:number}){
 const [jobs,setJobs]=useState<Job[]>([]);
 const [loadError,setLoadError]=useState("");
 const load=useCallback(async()=>{
  try{
   const r=await fetch(`/api/rooms/${encodeURIComponent(rid)}/owner-agent/jobs`,{headers:authHeaders(),cache:"no-store"});
   if(!r.ok)throw Error("조회 실패");
   const data=await r.json();
   setJobs(Array.isArray(data)?data:[]);setLoadError("");
  }catch{setLoadError("AI 응대 상태를 확인하지 못했습니다.");}
 },[rid]);
 useEffect(()=>{void load();const t=setInterval(()=>void load(),7000);return()=>clearInterval(t);},[load,revision]);
 const active=jobs.filter(j=>j.status==="pending"||j.status==="processing");
 const failed=jobs.filter(j=>j.status==="failed");
 if(!active.length&&!failed.length&&!loadError)return null;
 return <section className="card" aria-label="집주인 AI 응대 진행">
  {active.length?<p className="meta" role="status">⌂ 집주인 AI 응대 {active.length}건 처리·재시도 대기 중입니다. 답변은 이 채팅에 자동으로 나타납니다.</p>:null}
  {failed.length?<p className="meta" role="alert">⚠ 집주인 AI 응대 {failed.length}건이 반복 실패했습니다. 집주인이 내 집 관리에서 확인하고 다시 실행할 수 있습니다.</p>:null}
  {loadError?<p className="meta" role="status">{loadError}</p>:null}
 </section>;
}