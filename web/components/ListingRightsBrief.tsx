"use client";
import {useEffect,useState} from "react";
import {RIGHT_LABELS,REVIEW_CHECKS,type RightEntry} from "../lib/registry-rights-analysis";
type Brief={available:boolean;source:string;verified:false;issuedOn:string;sharedAt:string;rights:RightEntry[];note:string};
export default function ListingRightsBrief({listingId}:{listingId:string}){
 const [brief,setBrief]=useState<Brief|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/listings/"+encodeURIComponent(listingId)+"/rights-brief",{
   signal:controller.signal,cache:"no-store",
  }).then(async res=>{
   if(!res.ok)throw Error("권리요약을 조회하지 못했습니다.");
   return res.json() as Promise<Brief>;
  }).then(data=>{setBrief(data);setError("");})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"권리요약 조회 실패");})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[listingId]);
 const ages=brief?.issuedOn?Math.floor((Date.now()-Date.parse(brief.issuedOn+"T00:00:00Z"))/86400000):null;
 return <div aria-label="게시자가 공유한 미검증 권리기재">
  <h3>매물 권리기재 참고 정보</h3>
  {loading?<p role="status">공유된 권리기재를 확인하는 중...</p>:null}
  {error?<p role="alert">{error}</p>:null}
  {brief?.available?<div>
    <div className="photo-guide-tip">
     <strong>게시자 제공 · 공식 확인 미완료</strong>
     <p>아래 내용은 집주인 등록 계정이 공유한 <b>권리기재 후보</b>이며 대법원 발급 문서 검증·소유권/임대권한 인증·법률상 현행/말소 판정이 아닙니다. 화면에 없는 권리가 존재할 수 있습니다.</p>
     <p className="meta">문서 발급일(게시자 입력): {brief.issuedOn||"확인되지 않음"} · 공유된 항목 {brief.rights.length}건</p>
     {ages!==null&&ages>7?<p><strong>발급일 재확인 권장:</strong> 입력된 날짜로부터 7일 이상 지났습니다. 7일은 앱 자체 알림 기준이며 법정 유효기간이 아닙니다.</p>:null}
    </div>
    <div style={{display:"grid",gap:10}}>
     {brief.rights.map((right,index)=>
      <div className="card" key={index} style={{margin:0,padding:14}}>
       <strong>{RIGHT_LABELS[right.kind]??"기타 기재"} · {right.section==="unknown"?"등기구분 미확인":right.section}</strong>
       <p className="meta">현행·말소 효력 상태: <b>미확인</b>
        {right.rankNumber? " · 순위번호(게시자 입력) "+right.rankNumber:""}
        {right.registrationDate?" · 등기일(게시자 입력) "+right.registrationDate:""}
       </p>
       {right.kind==="mortgage"&&right.claimMaximumManwon!==null&&right.claimMaximumManwon!==undefined?
        <p>기재된 채권최고액 후보: {right.claimMaximumManwon.toLocaleString("ko-KR")}만원 · 실제 대출잔액과 다릅니다.</p>:null}
       {right.jointCollateralMentioned?<p>공동담보 여부·다른 부동산의 연계 확인 필요</p>:null}
       {right.cancellationPromised?<p>말소하겠다는 약속은 실제 말소등기 완료가 아닙니다.</p>:null}
      </div>)}
    </div>
   </div>:!loading?<p>게시자가 공개한 권리기재 요약이 없습니다. <strong>권리가 없거나 안전하다는 의미가 아닙니다.</strong></p>:null}
  <div className="photo-guide-tip">
   <h4>등기 외에 별도로 확인할 내용</h4>
   {Object.entries(REVIEW_CHECKS).map(([key,value])=>
    <p key={key}><strong>{value.label}</strong><br/>{value.nextAction}</p>)}
   <p className="meta">등기부만으로 선순위 임차인·체납액·대리권·실제 현장 상태를 모두 알 수 없습니다. 계약 전 공식 등기사항증명서를 재발급받고 관련 서류를 대조하세요.</p>
  </div>
  <div className="detail-footer-actions">
   <a className="btn ghost" href={"/registry/extract?listingId="+encodeURIComponent(listingId)}>브라우저에서 등기부 직접 확인하기 →</a>
   <a className="btn ghost" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">인터넷등기소에서 원문 열람 ↗</a>
  </div>
 </div>;
}
