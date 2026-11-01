"use client";
import {useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";

type Relation="registered_owner"|"co_owner"|"landlord_non_owner"|"delegated_agent"|"other";
type Authority={selfDeclared:boolean;relation:Relation|null;attestedAt?:string;relationVerified:boolean;verificationStatus:string;note?:string};
const options:{value:Relation;label:string}[]=[
 {value:"registered_owner",label:"등기상 소유자"},
 {value:"co_owner",label:"공유자 / 공동 소유자"},
 {value:"landlord_non_owner",label:"소유자와 다른 임대 권한 보유자"},
 {value:"delegated_agent",label:"정당한 위임을 받은 대리인"},
 {value:"other",label:"그 밖의 관계"},
];
export default function OwnerAuthorityPanel({listingId}:{listingId:string}){
 const [current,setCurrent]=useState<Authority|null>(null);
 const [relation,setRelation]=useState<Relation>("registered_owner");
 const [attested,setAttested]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const url=`/api/owner/listings/${encodeURIComponent(listingId)}/authority`;
 useEffect(()=>{
  if(!getAccessToken())return;
  let active=true;
  fetch(url,{headers:authHeaders(),cache:"no-store"}).then(async res=>{
   const body=await res.json();if(!res.ok)throw Error(body.error??"조회 실패");return body as Authority;
  }).then(data=>{if(active){setCurrent(data);if(data.relation)setRelation(data.relation);}})
    .catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 실패");});
  return()=>{active=false;};
 },[url]);
 const save=async()=>{
  if(busy||!attested)return;setBusy(true);setError("");setNotice("");
  try{
   const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
   const res=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",...(token?{"x-write-token":token}:{}),...authHeaders()},
    body:JSON.stringify({relation,attested:true})});
   const body=await res.json();
   if(!res.ok)throw Error(body.error??"저장 실패");
   setCurrent(body);setAttested(false);setNotice("게시권한 관계 진술이 저장됐습니다. 독립적인 권리 확인은 아직 진행되지 않았습니다.");
  }catch(e){setError(e instanceof Error?e.message:"저장 실패");}
  finally{setBusy(false);}
 };
 return <section className="card" aria-label="매물 게시권한 관계 확인">
  <h2>내가 이 매물을 게시할 권한</h2>
  <p>실제 등기상 소유자는 계정 로그인만으로 확인되지 않습니다. 관계를 선택하면 본인의 진술로 기록하며, 검증 배지는 부여하지 않습니다.</p>
  {current?.selfDeclared?<p className="meta">현재 등록된 관계: {options.find(x=>x.value===current.relation)?.label??"기타"} · 자기진술 기록 ({current.attestedAt?.slice(0,10)??""}) · 독립 검증 미완료</p>:null}
  <label>해당 부동산과의 관계<select value={relation} onChange={e=>{setRelation(e.target.value as Relation);setAttested(false);}}>
   {options.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}
  </select></label>
  <label className="registry-consent"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>
   <span>본인은 해당 매물 정보를 게시할 정당한 권한이 있다고 진술합니다. 관계를 허위로 입력하면 매물 공개가 제한될 수 있음을 이해합니다.</span></label>
  <p className="meta">이 단계에서는 등기부 원본·신분증·주민등록번호를 받지 않습니다. 소유권·위임관계 검증은 별도 절차가 필요합니다.</p>
  <button className="btn" type="button" disabled={busy||!attested} onClick={()=>void save()}>{busy?"저장 중...":"게시권한 진술 저장"}</button>
  {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
 </section>;
}
