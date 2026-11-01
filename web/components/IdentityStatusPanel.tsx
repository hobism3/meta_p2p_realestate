"use client";
import {useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";

type Identity={accountAuthenticated:boolean;identityStatus:string;identityVerified:boolean;identityServiceAvailable:boolean;explanation:string};
export default function IdentityStatusPanel(){
 const [data,setData]=useState<Identity|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!getAccessToken())return;
  let active=true;
  fetch("/api/identity/status",{headers:authHeaders(),cache:"no-store"})
   .then(async res=>{const body=await res.json();if(!res.ok)throw Error(body.error??"본인확인 상태 조회 실패");return body as Identity;})
   .then(body=>{if(active)setData(body);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 실패");});
  return()=>{active=false;};
 },[]);
 const start=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{
   const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
   const response=await fetch("/api/identity/start",{method:"POST",headers:{"Content-Type":"application/json",
    ...(token?{"x-write-token":token}:{}),...authHeaders()}});
   const body=await response.json();
   if(!response.ok)throw Error(body.error??"본인확인 요청 실패");
   const redirect=new URL(body.verificationUrl);
   if(redirect.protocol!=="https:")throw Error("안전하지 않은 본인확인 경로");
   window.location.assign(redirect.toString());
  }catch(e){setError(e instanceof Error?e.message:"본인확인 요청 실패");setBusy(false);}
 };
 return <section className="card" aria-label="본인확인 상태">
  <h2>본인확인</h2>
  <p>로그인 상태와 실명 본인확인, 부동산 게시권한 확인은 서로 별개입니다.</p>
  {error?<p role="alert">{error}</p>:data?
   <><p><span className="badge ok">로그인 계정 확인됨</span>{" "}
    <span className={data.identityVerified?"badge ok":"badge no"}>{data.identityVerified?"외부기관 본인확인 완료":"실명 본인확인 미완료"}</span></p>
    <p className="meta">{data.explanation}</p>
    {data.identityServiceAvailable&&!data.identityVerified?<button type="button" className="btn" disabled={busy} onClick={()=>void start()}>{busy?"연결 중...":"외부 본인확인 시작"}</button>:null}
    {!data.identityServiceAvailable?<p className="meta">본인확인기관 계약·API 연동 전입니다. PASS·토스 등 지정기관 연동과 운영 검증 후 이용할 수 있습니다. 현재는 신분증·주민등록번호를 수집하지 않습니다.</p>:null}
   </>:<p role="status">검증 상태 확인 중...</p>}
 </section>;
}
