"use client";
import {useEffect,useState} from "react";
import {authHeaders,getAccessToken} from "../../../../lib/client-auth";
import OwnerAuthorityPanel from "../../../../components/OwnerAuthorityPanel";
import ListingPhotoGuide from "../../../../components/ListingPhotoGuide";
import OwnerPublishedGallery from "../../../../components/OwnerPublishedGallery";
import {useUiLocale} from "../../../../lib/ui-locale";
type Slot={weekday:number;start:string;end:string};
type Policy={aiEnabled:boolean;visitMode:"approval"|"manual";availability:Slot[];answers:{pets:string;parking:string;notes:string};updatedAt:string|null};
const days=["일","월","화","수","목","금","토"];
const initial:Policy={aiEnabled:false,visitMode:"approval",availability:[],answers:{pets:"",parking:"",notes:""},updatedAt:null};
const preset:Slot={weekday:6,start:"13:00",end:"18:00"};
export default function OwnerListingSettings({params}:{params:{id:string}}){
 const {tr,en}=useUiLocale();
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
  <a href="/owner" className="owner-back">{tr("← 내 집 관리 · 확인 요청","← Owner hub · pending requests")}</a>
  <div className="owner-hero"><span>PROPERTY ASSISTANT</span><h1>{title||tr("매물","Property")} · {tr("AI 대리인","AI owner assistant")}</h1><p>{tr("집주인이 제공한 정보에만 근거해 답변하도록 준비하는 설정입니다. 설정된 매물 정보로만 AI가 자동 응답합니다. 집주인 판단이 필요한 문의는 내 집 관리에서 확인할 수 있습니다. 방문 예약은 집주인 승인 후 확정되며, 푸시·문자·이메일 알림은 아직 제공하지 않습니다.","AI replies only from owner-provided facts. Questions requiring judgment return to the owner. Visits require explicit owner approval. Push notifications are not available.")}</p></div>
  <OwnerAuthorityPanel listingId={params.id}/>
  <section className="card" aria-label={tr("이 매물의 등기 권리관계 확인","Property rights pre-check")}>
   <span className="eyebrow">REGISTRY PRE-CHECK</span><h2>{tr("매물 권리기재 확인 · 공유","Review and share property rights records")}</h2>
   <p>{tr("본인확인이나 법적 소유권 인증은 아닙니다. PDF를 브라우저에서만 분석한 뒤 필요한 정형 후보를 직접 검토할 수 있습니다. 공유하려면 별도 동의가 필요하며 원본은 서버에 저장되지 않습니다.","This is not identity or ownership verification. Review structured rights candidates from a PDF locally, then choose what to share. The original file is not stored.")}</p>
   <a className="btn ghost" href={"/registry/extract?listingId="+encodeURIComponent(params.id)}>{tr("이 매물 등기부 로컬 분석 →","Analyze a title-record PDF locally →")}</a>
   <a className="btn ghost" href={"/listings/"+encodeURIComponent(params.id)+"#registry-rights"}>{tr("공개된 안내 확인 ↗","View shared property notes ↗")}</a>
  </section>
  <section id="owner-gallery" aria-label={tr("매물 실제 사진 관리","Published property photos")}>
   <div className="card"><span className="eyebrow">PROPERTY PHOTOS</span>
    <h2>{tr("실제 매물 사진 · 공개 갤러리","Public property photo gallery")}</h2>
    <p>{tr("실사진을 가리고 검토한 후 명시적으로 게시할 수 있습니다. 저장된 게시용 JPEG만 매물 상세에 표시됩니다. 시연 이미지나 AI 가구 제거 결과는 저장하지 않습니다.","Inspect and mask real photos before explicit publishing. Only approved JPEG derivatives appear publicly. Demo and AI-edited images are not published.")}</p>
    <OwnerPublishedGallery listingId={params.id}/>
   </div>
   <ListingPhotoGuide listingId={params.id} onPublished={()=>window.dispatchEvent(new Event("directhome:gallery-published"))}/>
  </section>
  <section className="card"><h2>{tr("AI 대리인","AI owner assistant")}</h2><label className="owner-toggle"><input type="checkbox" checked={form.aiEnabled} onChange={e=>setForm(f=>({...f,aiEnabled:e.target.checked}))}/> AI 대리 응대 켜기 (등록된 사실만 자동 안내)</label>
  <p className="meta">{tr("집주인의 사전 설정 없이 가격·계약 조건을 바꾸거나 예약을 확정하지 않습니다.","The AI cannot change prices or contract terms or approve bookings on its own.")}</p>
  <h3>{tr("사전에 알려줄 내용","Owner-approved answers")}</h3><label>{tr("반려동물 정책","Pet policy")}<input value={form.answers.pets} maxLength={400} onChange={e=>setAnswer("pets",e.target.value)} placeholder={tr("예: 고양이 가능, 개는 집주인 확인 필요","E.g. Cats allowed; dogs require approval")}/></label>
  <label>{tr("주차 안내","Parking policy")}<input value={form.answers.parking} maxLength={400} onChange={e=>setAnswer("parking",e.target.value)} placeholder={tr("예: 주차 1대 가능","E.g. One parking space included")}/></label>
  <label>{tr("추가 안내","Additional notes")}<textarea value={form.answers.notes} maxLength={400} onChange={e=>setAnswer("notes",e.target.value)} placeholder={tr("사실로 확인된 안내만 입력해 주세요.","Only enter verified facts.")} rows={3}/></label>
  </section>
  <section className="card"><h2>{tr("방문 가능 시간","Available visit times")}</h2><p className="meta">{tr("한국 시간(Asia/Seoul), 반복되는 요일별 가능 시간입니다. 방문자는 등록된 시간 안에서 예약을 신청하고, 집주인은 내 집 관리에서 승인·거절할 수 있습니다. 자동 확정은 지원하지 않습니다.","Set weekly visit availability in Korea Standard Time. Visitors may request slots, but the owner must approve them.")}</p>
   <label>{tr("예약 요청 처리 방식","Visit approval mode")}<select value={form.visitMode} onChange={e=>setForm(f=>({...f,visitMode:e.target.value as Policy["visitMode"]}))}><option value="approval">{tr("집주인 승인 후 예약 확정","Owner must approve")}</option><option value="manual">{tr("모든 일정 직접 관리","Manual booking review")}</option></select></label>
   {form.availability.map((slot,i)=><div className="owner-slot" key={i}>
    <select aria-label={"요일 "+(i+1)} value={slot.weekday} onChange={e=>setSlot(i,"weekday",e.target.value)}>{days.map((d,n)=><option key={n} value={n}>{en?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][n]:d+"요일"}</option>)}</select>
    <input aria-label={"시작 시간 "+(i+1)} type="time" value={slot.start} onChange={e=>setSlot(i,"start",e.target.value)}/>
    <span>~</span>
    <input aria-label={"종료 시간 "+(i+1)} type="time" value={slot.end} onChange={e=>setSlot(i,"end",e.target.value)}/>
    <button type="button" className="btn ghost" onClick={()=>setForm(f=>({...f,availability:f.availability.filter((_,j)=>i!==j)}))}>{tr("삭제","Remove")}</button>
   </div>)}
   <button type="button" className="btn ghost" disabled={form.availability.length>=21} onClick={()=>setForm(f=>({...f,availability:[...f.availability,{...preset}]}))}>{tr("+ 가능 시간 추가","+ Add time slot")}</button>
  </section>
  {error?<p role="alert" className="owner-error">{error}</p>:null}{notice?<p role="status" className="owner-success">{notice}</p>:null}
  <div className="owner-actions"><button className="btn" onClick={save} disabled={saving}>{saving?tr("저장 중...","Saving..."):tr("설정 저장","Save settings")}</button><a className="btn ghost" href={"/listings/"+params.id}>{tr("매물 보기","View listing")}</a></div>
 </div>;
}
