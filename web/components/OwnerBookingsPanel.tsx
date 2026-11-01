"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../lib/client-auth";

type Booking={
 id:string;listing_id:string;listing_title:string;room_id:string;visit_date:string;visit_time:string;
 requester_id:string;status:"requested"|"confirmed"|"declined"|"cancelled";
};
const status:Record<Booking["status"],string>={requested:"승인 대기",confirmed:"방문 확정",declined:"거절",cancelled:"취소"};
function headers(){
 const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
 return {"Content-Type":"application/json",...(token?{"x-write-token":token}:{}),...authHeaders()};
}
export default function OwnerBookingsPanel(){
 const [items,setItems]=useState<Booking[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!getAccessToken()){setLoading(false);return;}
  try{
   const r=await fetch("/api/owner/bookings",{headers:authHeaders(),cache:"no-store"});
   const data=await r.json();
   if(!r.ok)throw Error(data.error??"일정 조회 실패");
   setItems(data);setError("");
  }catch(e){setError(e instanceof Error?e.message:"조회 실패");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
 const decide=async(item:Booking,action:"confirm"|"decline"|"cancel")=>{
  if(busy)return;
  setBusy(item.id);setError("");setNotice("");
  try{
   const r=await fetch(`/api/rooms/${item.room_id}/bookings/${item.id}`,{
    method:"PATCH",headers:headers(),body:JSON.stringify({action}),
   });
   const b=await r.json();
   if(!r.ok)throw Error(b.error??"예약 상태 변경 실패");
   await load();
   setNotice(action==="confirm"?"방문 일정이 확정됐습니다. 거래방에서 상대방도 확인할 수 있어요.":
    action==="decline"?"방문 요청을 거절했습니다.":"방문 예약을 취소했습니다.");
  }catch(e){setError(e instanceof Error?e.message:"변경 실패");}
  finally{setBusy(null);}
 };
 const pending=items.filter(i=>i.status==="requested");
 const upcoming=items.filter(i=>i.status==="confirmed");
 return <section className="card owner-visit-console" aria-label="방문 예약 관리">
  <div className="owner-attention-heading">
   <div><span className="eyebrow">VISITS · IN-APP</span>
    <h2>방문 예약 관리 <span className="owner-attention-count">{pending.length}</span></h2></div>
   <button type="button" className="btn ghost" onClick={()=>void load()}>새로고침</button>
  </div>
  <p className="meta">예약 신청과 승인 상태를 이 페이지에서 확인하세요. 현재 외부 푸시·문자·이메일 알림은 발송하지 않습니다.</p>
  {loading?<p role="status">예약 정보를 불러오는 중...</p>:items.length===0?<p className="owner-attention-empty">아직 신청된 방문 예약이 없습니다.</p>:
  <div className="owner-visit-list">
   {[...pending,...upcoming].map(b=><article className="owner-visit-item" key={b.id}>
    <strong>{b.listing_title}</strong>
    <span className="owner-visit-date">{b.visit_date} · {b.visit_time} · 60분</span>
    <span className={"owner-booking-status is-"+b.status}>{status[b.status]}</span>
    <div className="owner-booking-actions">
     {b.status==="requested"?<><button className="btn" disabled={!!busy} onClick={()=>void decide(b,"confirm")}>승인</button><button className="btn ghost" disabled={!!busy} onClick={()=>void decide(b,"decline")}>거절</button></>:<button className="btn ghost" disabled={!!busy} onClick={()=>void decide(b,"cancel")}>취소</button>}
     <a className="btn ghost" href={`/rooms/${b.room_id}`}>거래방 ↗</a>
    </div>
   </article>)}
   {pending.length===0&&upcoming.length===0?<p className="owner-attention-empty">진행 중인 방문 예약이 없습니다.</p>:null}
  </div>}
  {error?<p role="alert" className="owner-error">{error}</p>:null}
  {notice?<p role="status" className="owner-success">{notice}</p>:null}
 </section>;
}
