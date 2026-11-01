"use client";
import {useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../../../../lib/client-auth";
type Slot={weekday:number;start:string;end:string};
type Policy={aiEnabled:boolean;visitMode:"approval"|"manual";availability:Slot[];answers:{pets:string;parking:string;notes:string};updatedAt:string|null};
const days=["일","월","화","수","목","금","토"];
const initial:Policy={aiEnabled:false,visitMode:"approval",availability:[],answers:{pets:"",parking:"",notes:""},updatedAt:null};
const preset:Slot={weekday:6,start:"13:00",end:"18:00"};
export default function OwnerListingSettings({params}:{params:{id:string}}){
 const [form,setForm]=useState<Policy>(initial);
 const [title,setTitle]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const endpoint="/api/owner/listings/"+encodeURIComponent(params.id)+"/ai";
 useEffect(()=>{if(!getAccessToken()){setError("로그인 후 이용할 수 있어요.");setLoading(false);return;}
 Promise.all([fetch(endpoint,{headers:authHeaders()}),fetch("/api/listings/"+encodeURIComponent(params.id),{headers:authHeaders()})]).then(async([policy,listing])=>{
  if(!policy.ok)throw Error((await policy.json()).error??"설정 조회 실패");
  setForm(await policy.json());if(listing.ok)setTitle((await listing.json()).title??"매물");
 }).catch(e=>setError(e instanceof Error?e.message:"조회 실패")).finally(()=>setLoading(false));
 },[endpoint,params.id]);
 const setAnswer=(field:keyof Policy["answers"],value:string)=>setForm(f=>({...f,answers:{...f.answers,[field]:value}}));
 const setSlot=(i:number,part:keyof Slot,value:string|number)=>setForm(f=>({...f,availability:f.availability.map((s,j)=>j===i?{...s,[part]:part==="weekday"?Number(value):value}:s)}));
 const save=async()=>{setSaving(true);setError("");setNotice("");try{
  const token=process.env.NEXT_PUBLIC_WRITE_TOKEN;
  const res=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json",...(token?{"x-write-token":token}:{}),...authHeaders()},body:JSON.stringify(form)});
  const body=await res.json();
  if(!res.ok)throw Error(body.error??"저장 실패");
  setForm(body);setNotice("집주인 AI 설정과 방문 가능 시간이 저장됐어요.");
 }catch(e){setError(e instanceof Error?e.message:"저장 실패");}finally{setSaving(false);}};
 if(loading)return <p role="status">설정을 불러오는 중...</p>;
 return <div className="owner-page owner-settings">
  <a href="/owner" className="owner-back">← 내 집 관리 · 확인 요청</a>
  <div className="owner-hero"><span>PROPERTY ASSISTANT</span><h1>{title||"매물"} · AI 대리인</h1><p>집주인이 제공한 정보에만 근거해 답변하도록 준비하는 설정입니다. 설정된 매물 정보로만 AI가 자동 응답합니다. 집주인 판단이 필요한 문의는 내 집 관리에서 확인할 수 있습니다. 방문 예약은 집주인 승인 후 확정되며, 푸시·문자·이메일 알림은 아직 제공하지 않습니다.</p></div>
  <section className="card"><h2>AI 대리인</h2><label className="owner-toggle"><input type="checkbox" checked={form.aiEnabled} onChange={e=>setForm(f=>({...f,aiEnabled:e.target.checked}))}/> AI 대리 응대 켜기 (등록된 사실만 자동 안내)</label>
  <p className="meta">집주인의 사전 설정 없이 가격·계약 조건을 바꾸거나 예약을 확정하지 않습니다.</p>
  <h3>사전에 알려줄 내용</h3><label>반려동물 정책<input value={form.answers.pets} maxLength={400} onChange={e=>setAnswer("pets",e.target.value)} placeholder="예: 고양이 가능, 개는 집주인 확인 필요"/></label>
  <label>주차 안내<input value={form.answers.parking} maxLength={400} onChange={e=>setAnswer("parking",e.target.value)} placeholder="예: 주차 1대 가능"/></label>
  <label>추가 안내<textarea value={form.answers.notes} maxLength={400} onChange={e=>setAnswer("notes",e.target.value)} placeholder="사실로 확인된 안내만 입력해 주세요." rows={3}/></label>
  </section>
  <section className="card"><h2>방문 가능 시간</h2><p className="meta">한국 시간(Asia/Seoul), 반복되는 요일별 가능 시간입니다. 방문자는 등록된 시간 안에서 예약을 신청하고, 집주인은 내 집 관리에서 승인·거절할 수 있습니다. 자동 확정은 지원하지 않습니다.</p>
   <label>예약 요청 처리 방식<select value={form.visitMode} onChange={e=>setForm(f=>({...f,visitMode:e.target.value as Policy["visitMode"]}))}><option value="approval">집주인 승인 후 예약 확정</option><option value="manual">모든 일정 직접 관리</option></select></label>
   {form.availability.map((slot,i)=><div className="owner-slot" key={i}>
    <select aria-label={"요일 "+(i+1)} value={slot.weekday} onChange={e=>setSlot(i,"weekday",e.target.value)}>{days.map((d,n)=><option key={n} value={n}>{d}요일</option>)}</select>
    <input aria-label={"시작 시간 "+(i+1)} type="time" value={slot.start} onChange={e=>setSlot(i,"start",e.target.value)}/>
    <span>~</span>
    <input aria-label={"종료 시간 "+(i+1)} type="time" value={slot.end} onChange={e=>setSlot(i,"end",e.target.value)}/>
    <button type="button" className="btn ghost" onClick={()=>setForm(f=>({...f,availability:f.availability.filter((_,j)=>i!==j)}))}>삭제</button>
   </div>)}
   <button type="button" className="btn ghost" disabled={form.availability.length>=21} onClick={()=>setForm(f=>({...f,availability:[...f.availability,{...preset}]}))}>+ 가능 시간 추가</button>
  </section>
  {error?<p role="alert" className="owner-error">{error}</p>:null}{notice?<p role="status" className="owner-success">{notice}</p>:null}
  <div className="owner-actions"><button className="btn" onClick={save} disabled={saving}>{saving?"저장 중...":"설정 저장"}</button><a className="btn ghost" href={"/listings/"+params.id}>매물 보기</a></div>
 </div>;
}
