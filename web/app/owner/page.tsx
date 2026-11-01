"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {authHeaders,getAccessToken} from "../../lib/client-auth";
import OwnerAttentionPanel from "../../components/OwnerAttentionPanel";
import OwnerBookingsPanel from "../../components/OwnerBookingsPanel";
type OwnerListing={id:string;title:string;address:string;tradeType:string;deposit:number;rent:number;salePrice:number;rooms:number;aiEnabled:boolean};
export default function OwnerPage(){
 const [rows,setRows]=useState<OwnerListing[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [search,setSearch]=useState("");
 const [filter,setFilter]=useState<"all"|"ai_on"|"ai_off">("all");
 const [sort,setSort]=useState<"rooms"|"title">("rooms");
 const totalRooms=useMemo(()=>rows.reduce((sum,row)=>sum+row.rooms,0),[rows]);
 const enabledCount=useMemo(()=>rows.filter(row=>row.aiEnabled).length,[rows]);
 const visibleRows=useMemo(()=>rows.filter(row=>{
  const matchesText=`${row.title} ${row.address}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  return matchesText&&(filter==="all"||(filter==="ai_on"?row.aiEnabled:!row.aiEnabled));
 }).sort((a,b)=>sort==="rooms"?b.rooms-a.rooms||a.title.localeCompare(b.title,"ko"):a.title.localeCompare(b.title,"ko")),[rows,search,filter,sort]);
 const load=useCallback(async()=>{
  try{const res=await fetch("/api/owner/listings",{headers:authHeaders()});
   if(!res.ok)throw Error((await res.json()).error??"목록 조회 실패");
   setRows(await res.json());setError("");
  }catch(e){setError(e instanceof Error?e.message:"조회 실패");}finally{setLoading(false);}
 },[]);
 useEffect(()=>{if(getAccessToken())void load();else setLoading(false);},[load]);
 return <div className="owner-page">
  <div className="owner-hero"><span>OWNER WORKSPACE</span><h1>내 집 관리</h1>
   <p>내 매물의 AI 응대, 문의 확인 요청, 방문 가능 시간을 한곳에서 관리하세요. 방문 예약은 집주인이 승인해야 확정됩니다. 외부 푸시·문자·이메일 알림은 아직 제공하지 않습니다.</p>
   <a className="btn" href="/register">+ 새 매물 등록</a></div>
  {getAccessToken()?<><OwnerBookingsPanel/><OwnerAttentionPanel/></>:null}
  {!getAccessToken()?<div className="card">내 매물 관리는 로그인이 필요합니다. <a href="/login">로그인</a></div>:
   loading?<p role="status">내 매물을 불러오는 중...</p>:
   error?<p role="alert">{error}</p>:
   rows.length===0?<div className="card"><h2>등록한 매물이 없어요</h2><p>매물을 등록하면 여기에서 설정을 이어갈 수 있어요.</p><a className="btn" href="/register">매물 등록</a></div>:
   <section className="card" aria-label="내 매물 업무 요약"><h2>한눈에 보는 내 매물</h2><p>등록 매물 {rows.length}개 · 문의 거래방 {totalRooms}개 · AI 응대 활성 {enabledCount}개</p><p>문의 거래방 수는 미처리 건수가 아닙니다. 확인이 필요한 항목은 위 확인 요청함에서 확인하세요.</p><div className="owner-toolbar" style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}><label>매물 검색 <input aria-label="매물명 또는 주소 검색" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름·주소"/></label><label>AI 응대 <select aria-label="AI 응대 상태 필터" value={filter} onChange={e=>setFilter(e.target.value as "all"|"ai_on"|"ai_off")}><option value="all">전체</option><option value="ai_on">켜짐</option><option value="ai_off">꺼짐</option></select></label><label>정렬 <select aria-label="매물 정렬" value={sort} onChange={e=>setSort(e.target.value as "rooms"|"title")}><option value="rooms">문의 거래방 많은 순</option><option value="title">매물명 순</option></select></label></div><p role="status">검색 결과 {visibleRows.length}개</p></section><div className="owner-list-grid">{visibleRows.map(l=><article className="card owner-list-card" key={l.id}>
    <span className="owner-pill">{l.tradeType}</span><h2>{l.title}</h2><p>{l.address}</p>
    <p className="owner-price">{l.tradeType==="월세"?`보증금 ${l.deposit.toLocaleString()} / 월세 ${l.rent.toLocaleString()}만원`:l.tradeType==="전세"?`${l.deposit.toLocaleString()}만원`:`${l.salePrice.toLocaleString()}만원`}</p>
    <p className="owner-ai-status">문의 거래방 {l.rooms}개 · {l.aiEnabled?"● AI 대리인 응대 중":"○ AI 대리인 꺼짐"}</p>
    <div><a className="btn" href={`/owner/listings/${l.id}`}>AI·방문 설정 →</a> <a className="btn ghost" href={`/register?edit=${l.id}`}>매물 수정</a></div>
   </article>)}</div>}
 </div>;
}
