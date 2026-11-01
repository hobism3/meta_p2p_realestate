"use client";
import {useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";

const reasons=[
 {value:"misleading_listing",label:"허위·과장 광고 의심"},
 {value:"suspected_impersonation",label:"소유자·게시자 사칭 의심"},
 {value:"incorrect_information",label:"면적·가격·기타 정보 오류"},
 {value:"personal_information",label:"개인정보 노출"},
 {value:"other",label:"기타 오류"},
] as const;
export default function ListingReportPanel({listingId}:{listingId:string}){
 const [reason,setReason]=useState<(typeof reasons)[number]["value"]>("misleading_listing");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [receipt,setReceipt]=useState<{reportId:string;message:string}|null>(null);
 const submit=async()=>{
  if(busy)return;
  if(!getAccessToken()){window.location.href="/login";return;}
  setBusy(true);setError("");
  try{
   const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
   const res=await fetch(`/api/listings/${encodeURIComponent(listingId)}/report`,{
    method:"POST",headers:{"Content-Type":"application/json",...(token?{"x-write-token":token}:{}),...authHeaders()},
    body:JSON.stringify({category:reason}),
   });
   const body=await res.json();if(!res.ok)throw Error(body.error??"신고 등록 실패");
   setReceipt(body);
  }catch(e){setError(e instanceof Error?e.message:"신고 등록 실패");}
  finally{setBusy(false);}
 };
 return <div className="listing-report-panel">
  <h3>매물 정보 오류 신고</h3>
  <p className="meta">신고는 서버에 접수 이력으로 저장되며, 사실확인이나 게시 중단이 자동으로 이루어지는 것은 아닙니다. 주민등록번호·계좌 등 개인정보는 입력받지 않습니다.</p>
  <label>신고 사유<select aria-label="신고 사유" value={reason} onChange={e=>{setReason(e.target.value as typeof reason);setReceipt(null);}}>
   {reasons.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
  </select></label>
  <button type="button" className="btn ghost" disabled={busy} onClick={()=>void submit()}>{busy?"접수 중...":"오류 신고하기"}</button>
  {receipt?<p role="status" className="meta">접수번호: {receipt.reportId}. {receipt.message}</p>:null}
  {error?<p role="alert" className="error">{error}</p>:null}
 </div>;
}
