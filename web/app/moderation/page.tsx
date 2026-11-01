"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../../lib/client-auth";
type Report={id:string;listingId:string;listingTitle:string;category:string;status:"received"|"triaged"|"closed";createdAt:string};
const categories:Record<string,string>={
 misleading_listing:"허위·과장 의심",suspected_impersonation:"게시자 사칭 의심",
 incorrect_information:"정보 오류",personal_information:"개인정보 노출",other:"기타",
};
export default function ModerationPage(){
 const [reports,setReports]=useState<Report[]>([]);
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const load=useCallback(async()=>{
  try{
   const r=await fetch("/api/internal/listing-reports",{headers:authHeaders(),cache:"no-store"});
   const b=await r.json();if(!r.ok)throw Error(b.error??"조회 권한 없음");
   setReports(b.reports);setError("");
  }catch(e){setError(e instanceof Error?e.message:"조회 실패");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{if(getAccessToken())void load();else{setError("관리자 로그인이 필요합니다.");setLoading(false);}},[load]);
 const update=async(id:string,status:"triaged"|"closed")=>{
  if(busy)return;setBusy(id);setError("");
  try{
   const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
   const r=await fetch("/api/internal/listing-reports",{method:"PATCH",headers:{
    "Content-Type":"application/json",...(token?{"x-write-token":token}:{}),...authHeaders()},body:JSON.stringify({id,status})});
   const b=await r.json();if(!r.ok)throw Error(b.error??"변경 실패");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"변경 실패");}
  finally{setBusy("");}
 };
 return <div className="grid owner-page">
  <div className="owner-hero"><span>REPORT REVIEW</span><h1>매물 신고 검토</h1>
   <p>서버에 허가된 검토자만 접근할 수 있습니다. 신고 접수는 허위 매물 확정이 아니며, 조사 없이 자동 삭제하지 않습니다.</p></div>
  <section className="card"><h2>접수 내역</h2>
   <button className="btn ghost" type="button" onClick={()=>void load()}>새로고침</button>
   {error?<p role="alert">{error}</p>:null}
   {loading?<p role="status">신고 내역 확인 중...</p>:null}
   {reports.length===0&&!loading&&!error?<p>접수된 신고가 없습니다.</p>:null}
   {reports.map(r=><article className="card" key={r.id}>
    <p><b>{r.listingTitle}</b> · {categories[r.category]??r.category} · {r.status}</p>
    <p className="meta">{r.createdAt} · 사건번호: {r.id}</p>
    <a className="btn ghost" href={`/listings/${encodeURIComponent(r.listingId)}`}>매물 확인</a>{" "}
    {r.status==="received"?<button className="btn ghost" disabled={busy===r.id} onClick={()=>void update(r.id,"triaged")}>검토 착수</button>:null}{" "}
    {r.status!=="closed"?<button className="btn ghost" disabled={busy===r.id} onClick={()=>void update(r.id,"closed")}>조치 검토 완료 기록</button>:null}
   </article>)}
  </section>
 </div>;
}
