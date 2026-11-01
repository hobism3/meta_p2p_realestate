"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders} from "../lib/client-auth";

type VisitBooking={id:string;visit_date:string;visit_time:string;status:"requested"|"confirmed"|"declined"|"cancelled"|"expired";requester_id:string};
type VisitState={bookings:VisitBooking[];availability:{weekday:number;start:string;end:string}[];mode:"approval"|"manual";isOwner:boolean;available:string[]};
const labels:Record<VisitBooking["status"],string>={
 requested:"집주인 승인 대기",confirmed:"방문 확정",declined:"거절됨",cancelled:"취소됨",expired:"24시간 초과 · 자동 만료",
};
function todaySeoul(offset=0){
 const d=new Date(Date.now()+offset*86400000);
 return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function headers(){
 const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
 return {"Content-Type":"application/json",...(token?{"x-write-token":token}:{}),...authHeaders()};
}
export default function RoomBookingPanel({rid,onUpdated}:{rid:string;onUpdated?:()=>void}){
 const [date,setDate]=useState(()=>todaySeoul(1));
 const [time,setTime]=useState("");
 const [state,setState]=useState<VisitState|null>(null);
 const [pending,setPending]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  try{
   const res=await fetch(`/api/rooms/${encodeURIComponent(rid)}/bookings?date=${encodeURIComponent(date)}`,{
    headers:authHeaders(),cache:"no-store",
   });
   const data=await res.json();
   if(!res.ok)throw Error(data.error??"예약 조회 실패");
   setState(data);
   setTime(v=>data.available.includes(v)?v:"");
  }catch(e){setError(e instanceof Error?e.message:"예약 조회 실패");}
  finally{setLoading(false);}
 },[rid,date]);
 useEffect(()=>{void refresh();const id=setInterval(()=>void refresh(),12000);return()=>clearInterval(id);},[refresh]);
 const send=async(action:"request"|"confirm"|"decline"|"cancel",id?:string)=>{
  if(pending)return;
  setPending(true);setError("");setNotice("");
  try{
   const url=action==="request"?`/api/rooms/${rid}/bookings`:`/api/rooms/${rid}/bookings/${id}`;
   const res=await fetch(url,{method:action==="request"?"POST":"PATCH",headers:headers(),
     body:JSON.stringify(action==="request"?{date,time}:{action})});
   const body=await res.json();
   if(!res.ok)throw Error(body.error??"방문 예약 처리 실패");
   setNotice(action==="request"?"방문 예약 요청을 전달했습니다. 집주인 승인 전까지는 확정되지 않습니다.":
    action==="confirm"?"방문 일정이 확정됐습니다.":action==="decline"?"방문 요청을 거절했습니다.":"방문 예약을 취소했습니다.");
   await refresh();onUpdated?.();
  }catch(e){setError(e instanceof Error?e.message:"방문 일정 처리 실패");}
  finally{setPending(false);}
 };
 const hasActive=!!state?.bookings.some(b=>b.status==="requested"||b.status==="confirmed");
 if(loading)return <section className="card owner-booking-card"><h3>방문 일정</h3><p role="status">방문 가능한 시간을 확인하고 있습니다.</p></section>;
 if(!state)return <section className="card owner-booking-card"><h3>방문 일정</h3><p role="alert">{error||"조회 실패"}</p></section>;
 return <section className="owner-booking-card" aria-label="방문 예약">
  <div className="owner-booking-heading">
   <div><span className="eyebrow">VISIT SCHEDULE</span><h3>방문 예약 · 일정 확인</h3></div>
   <span className="owner-booking-kst">한국 시간 · KST</span>
  </div>
  <p className="meta">등록된 방문 가능 시간에서 60분 단위로 신청합니다. 집주인이 승인하기 전에는 예약 확정이 아닙니다. 승인 대기는 최대 24시간 유지됩니다. 앱·푸시 알림 없이 이 페이지에서 진행 상태를 확인합니다.</p>
  {!state.isOwner&&state.mode==="approval"&&state.availability.length>0&&!hasActive?(
   <div className="owner-booking-form">
    <label>방문 날짜 <input aria-label="방문 날짜" type="date" min={todaySeoul()} value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label>방문 시간
     <select aria-label="방문 시간" value={time} onChange={e=>setTime(e.target.value)}>
      <option value="">가능한 시간 선택</option>
      {state.available.map(t=><option key={t} value={t}>{t} ~ {(() => {const [h,m]=t.split(":").map(Number);const v=h*60+m+60;return `${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`;})()}</option>)}
     </select>
    </label>
    <button className="btn" disabled={!time||pending} type="button" onClick={()=>void send("request")}>{pending?"처리 중...":"방문 예약 요청"}</button>
    {state.available.length===0?<span className="meta">선택한 날짜에는 예약 가능한 시간이 없습니다.</span>:null}
   </div>
  ):!state.isOwner&&hasActive?<p className="meta">이미 신청하거나 확정한 예약이 있습니다. 변경하려면 아래 예약을 먼저 취소해 주세요.</p>
  :!state.isOwner?<p className="meta">방문 예약 시간이 아직 등록되지 않았거나 집주인이 직접 일정을 관리합니다. 채팅에서 문의해주세요.</p>:null}
  {state.bookings.length>0?<div className="owner-booking-history">
   <strong>신청·확정 내역</strong>
   {state.bookings.slice(0,15).map(b=><div className="owner-booking-row" key={b.id}>
    <span>{b.visit_date} · {b.visit_time}</span>
    <span className={"owner-booking-status is-"+b.status}>{labels[b.status]}</span>
    <div className="owner-booking-actions">
     {state.isOwner&&b.status==="requested"?<><button type="button" disabled={pending} className="btn" onClick={()=>void send("confirm",b.id)}>승인</button><button type="button" disabled={pending} className="btn ghost" onClick={()=>void send("decline",b.id)}>거절</button></>:null}
     {(b.status==="requested"||b.status==="confirmed")?<button type="button" disabled={pending} className="btn ghost" onClick={()=>void send("cancel",b.id)}>예약 취소</button>:null}
    </div>
   </div>)}
  </div>:null}
  {error?<p role="alert" className="owner-error">{error}</p>:null}
  {notice?<p role="status" className="owner-success">{notice}</p>:null}
 </section>;
}
