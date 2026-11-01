"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../../lib/client-auth";
import OwnerAttentionPanel from "../../components/OwnerAttentionPanel";
type OwnerListing={id:string;title:string;address:string;tradeType:string;deposit:number;rent:number;salePrice:number;rooms:number;aiEnabled:boolean};
export default function OwnerPage(){
 const [rows,setRows]=useState<OwnerListing[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  try{const res=await fetch("/api/owner/listings",{headers:authHeaders()});
   if(!res.ok)throw Error((await res.json()).error??"목록 조회 실패");
   setRows(await res.json());
  }catch(e){setError(e instanceof Error?e.message:"조회 실패");}finally{setLoading(false);}
 },[]);
 useEffect(()=>{if(getAccessToken())void load();else setLoading(false);},[load]);
 return <div className="owner-page">
  <div className="owner-hero"><span>OWNER WORKSPACE</span><h1>내 집 관리</h1>
   <p>내 매물의 AI 응대, 문의 확인 요청, 방문 가능 시간을 한곳에서 관리하세요. 방문 예약 확정과 외부 알림 발송은 아직 제공하지 않습니다.</p>
   <a className="btn" href="/register">+ 새 매물 등록</a></div>
  {getAccessToken()?<OwnerAttentionPanel/>:null}
  {!getAccessToken()?<div className="card">내 매물 관리는 로그인이 필요합니다. <a href="/login">로그인</a></div>:
   loading?<p role="status">내 매물을 불러오는 중...</p>:
   error?<p role="alert">{error}</p>:
   rows.length===0?<div className="card"><h2>등록한 매물이 없어요</h2><p>매물을 등록하면 여기에서 설정을 이어갈 수 있어요.</p><a className="btn" href="/register">매물 등록</a></div>:
   <div className="owner-list-grid">{rows.map(l=><article className="card owner-list-card" key={l.id}>
    <span className="owner-pill">{l.tradeType}</span><h2>{l.title}</h2><p>{l.address}</p>
    <p className="owner-price">{l.tradeType==="월세"?`보증금 ${l.deposit.toLocaleString()} / 월세 ${l.rent.toLocaleString()}만원`:l.tradeType==="전세"?`${l.deposit.toLocaleString()}만원`:`${l.salePrice.toLocaleString()}만원`}</p>
    <p className="owner-ai-status">문의 거래방 {l.rooms}개 · {l.aiEnabled?"● AI 대리인 응대 중":"○ AI 대리인 꺼짐"}</p>
    <div><a className="btn" href={`/owner/listings/${l.id}`}>AI·방문 설정 →</a> <a className="btn ghost" href={`/register?edit=${l.id}`}>매물 수정</a></div>
   </article>)}</div>}
 </div>;
}
