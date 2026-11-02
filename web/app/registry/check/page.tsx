"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {REGISTRY_TRANSFER_KEY,parseSanitizedTransfer,toSanitizedTransfer} from "../../../lib/registry-extraction-transfer";
import {authHeaders,getAccessToken} from "../../../lib/client-auth";
import {REGISTRY_SIGNALS,registryReview,type RegistryFlag} from "../../../lib/registry-review";
import {
 REVIEW_CHECKS,RIGHT_LABELS,REVIEW_AGE_REMINDER_DAYS,reviewRegistryRights,
 type RightEntry,type RightKind,type RightStatus,type RightSection,type ReviewCheckKey,type UserReviewStatus,
} from "../../../lib/registry-rights-analysis";

const flags=Object.keys(REGISTRY_SIGNALS) as RegistryFlag[];
const checkKeys=Object.keys(REVIEW_CHECKS) as ReviewCheckKey[];
const rightKinds=Object.keys(RIGHT_LABELS) as RightKind[];
const statuses:{value:RightStatus;label:string}[]=[
 {value:"active",label:"현행(유효)으로 기재"},
 {value:"cancelled",label:"말소로 기재"},
 {value:"unknown",label:"상태 확인 전"},
];
function seoulToday():string{
 return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function optionalNumber(s:string):number|null{
 return s.trim()===""?null:Number(s);
}
export default function RegistryReadingGuide(){
 const [selected,setSelected]=useState<RegistryFlag[]>([]);
 const [issuedOn,setIssuedOn]=useState("");
 const [deposit,setDeposit]=useState<number|null>(null);
 const [rights,setRights]=useState<RightEntry[]>([]);
 const [checks,setChecks]=useState<Partial<Record<ReviewCheckKey,UserReviewStatus>>>({});
 const [example,setExample]=useState(false);
 const [copyNotice,setCopyNotice]=useState("");
 const [shareListingId,setShareListingId]=useState("");
 const [shareConsent,setShareConsent]=useState(false);
 const [acceptUnverified,setAcceptUnverified]=useState(false);
 const [sharing,setSharing]=useState(false);
 const [shareNotice,setShareNotice]=useState("");
 const [transferNotice,setTransferNotice]=useState("");
 const id=useRef(0);
 useEffect(()=>{
  const listing=new URLSearchParams(window.location.search).get("listingId")??"";
  if(/^[a-f0-9-]{36}$/i.test(listing))setShareListingId(listing);
 },[]);
 useEffect(()=>{
  try{
   const raw=sessionStorage.getItem(REGISTRY_TRANSFER_KEY);
   if(!raw)return;
   sessionStorage.removeItem(REGISTRY_TRANSFER_KEY); // one-time, never replay automatically
   const parsed=parseSanitizedTransfer(raw);
   if(!parsed||parsed.rights.length===0){setTransferNotice("전달된 권리정보 형식을 확인하지 못했습니다. 직접 확인해 주세요.");return;}
   setRights(parsed.rights);
   setSelected([]);setExample(false);
   setTransferNotice(`이전 화면에서 사용자가 대조한 정형 권리 후보 ${parsed.rights.length}건을 불러왔습니다. 진위 또는 법률상 효력 확인은 아닙니다.`);
  }catch{setTransferNotice("브라우저 세션에서 정형 권리정보를 가져오지 못했습니다.");}
 },[]);
 const quick=useMemo(()=>registryReview(selected),[selected]);
 const structured=useMemo(()=>reviewRegistryRights({
  issuedOn,asOfDate:seoulToday(),proposedDepositManwon:deposit,rights,checks,
 }),[issuedOn,deposit,rights,checks]);
 const addEntry=()=>{
  if(rights.length>=50)return;
  id.current+=1;
  setRights(previous=>[...previous,{
   id:`local-${id.current}`,kind:"mortgage",section:"을구",status:"unknown",
   claimMaximumManwon:null,registrationDate:"",rankNumber:null,
  }]);
  setExample(false);
 };
 const updateEntry=(key:string,patch:Partial<RightEntry>)=>{
  setRights(previous=>previous.map(x=>x.id===key?{...x,...patch}:x));setExample(false);
 };
 const reset=()=>{
  setSelected([]);setIssuedOn("");setDeposit(null);setRights([]);setChecks({});
  setExample(false);setCopyNotice("");setTransferNotice("");
 };
 const loadExample=()=>{
  setSelected(["mortgage","trust","unknown_tenant_priority","unknown_tax"]);
  setIssuedOn(seoulToday());
  setDeposit(3000);
  setRights([
   {id:"fictional-1",kind:"mortgage",section:"을구",status:"active",claimMaximumManwon:24000,rankNumber:1},
   {id:"fictional-2",kind:"trust",section:"갑구",status:"unknown",rankNumber:2},
  ]);
  setChecks({});setExample(true);setCopyNotice("");
 };
 const share=async()=>{
  if(sharing||!shareListingId||example||!shareConsent||!acceptUnverified||!getAccessToken())return;
  if(!rights.length||rights.length>20){
   setShareNotice("공유할 권리기재를 1~20건만 선택해 주세요. 0건은 권리가 없다는 증거가 아닙니다.");return;
  }
  setSharing(true);setShareNotice("");
  try{
   const sanitized=toSanitizedTransfer(rights);
   if(sanitized.rights.length!==rights.length)throw new Error("권리기재 형식이 불완전합니다.");
   const res=await fetch("/api/listings/"+encodeURIComponent(shareListingId)+"/rights-brief",{
    method:"POST",headers:{"Content-Type":"application/json",...authHeaders(),
      ...(process.env.NEXT_PUBLIC_WRITE_TOKEN?{"x-write-token":process.env.NEXT_PUBLIC_WRITE_TOKEN}:{})},
    body:JSON.stringify({
     rights:sanitized.rights,issuedOn,confirmSharing:true,acceptUnverified:true,synthetic:false,
    }),
   });
   const data=await res.json() as {error?:string};
   if(!res.ok)throw new Error(data.error||"요약 공유 실패");
   setShareNotice("게시자 제공·미검증 권리기재 요약을 공유했습니다. 공식 확인이나 안전 인증은 아닙니다.");
  }catch(e){setShareNotice(e instanceof Error?e.message:"공유 실패");}
  finally{setSharing(false);}
 };
 const copy=async()=>{
  const text=[
   "집톡이 권리관계 자가점검 (사용자 입력 정보, 법적 검증 아님)",
   `등기 발급일(입력): ${issuedOn||"미확인"} / 가상 예시: ${example?"예":"아니오"}`,
   `입력한 현행 근저당권 ${structured.activeMortgageCount}건 / 유효 채권최고액 합계: ${structured.activeMortgageMaximumManwon===null?"금액 불완전":structured.activeMortgageMaximumManwon.toLocaleString("ko-KR")+"만원"}`,
   ...structured.findings.map(f=>`[${f.title}] ${f.detail} 추가 확인: ${f.nextAction}`),
   ...structured.notes,
  ].join("\n");
  try{
   await navigator.clipboard.writeText(text);
   setCopyNotice("분석 메모를 복사했습니다. 외부로 공유하기 전 정보와 개인정보 포함 여부를 확인하세요.");
  }catch{setCopyNotice("복사 기능을 사용할 수 없습니다. 화면에서 직접 내용을 확인해 주세요.");}
 };
 return <div className="grid owner-page registry-review-page">
  <div className="owner-hero"><span>REGISTRY REVIEW · LOCAL ONLY</span>
   <h1>등기부 권리관계 읽기</h1>
   <p>공식 등기부의 확인 내용을 바탕으로, 선순위 권리와 추가 서류 확인에 필요한 체크리스트를 만듭니다. 이 화면에서 원본 PDF·소유자명·주소·주민등록번호를 입력받거나 서버에 전송하지 않습니다.</p>
  </div>
  <section className="card">
   <h2>1. 공식 등기사항증명서 확인</h2>
   <p>등기부는 소유자가 아니어도 열람할 수 있습니다. 반드시 정확한 동·호, 현행/말소 기록, 증명서 발급 시점을 직접 확인하세요.</p>
   <a className="btn ghost" href="https://www.iros.go.kr/" target="_blank" rel="noopener noreferrer">대법원 인터넷등기소에서 열람 ↗</a>
   <p className="meta">등기정보 열람과 외부 업체의 상업적 재이용 권한은 다른 문제입니다. 이 도구는 소유권·계약권한 인증이나 법률 자문을 제공하지 않습니다.</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"end",marginTop:12}}>
    <label>문서 발급일 (사용자 확인)<input aria-label="등기부 발급일" type="date" value={issuedOn} onChange={e=>{setIssuedOn(e.target.value);setExample(false);}}/></label>
    <label>예정 보증금 (만원·선택)<input aria-label="예정 보증금 만원" type="number" min="0" max="100000000" step="1" placeholder="입력하지 않아도 됩니다" value={deposit??""} onChange={e=>{setDeposit(optionalNumber(e.target.value));setExample(false);}}/></label>
   </div>
   <p className="meta">발급 후 {REVIEW_AGE_REMINDER_DAYS}일 알림은 앱 자체의 확인 권고이며, 법에서 정한 등기부 유효기간이 아닙니다. 보증금만으로 안전성을 계산하지 않습니다.</p>
   <a className="btn ghost" href="/registry/cases">유형별 38개 교육 사례 보기 ↗</a>{" "}
   <a className="btn ghost" href="/registry/extract">PDF 자동 텍스트층에서 권리 후보 추출 →</a>{" "}
   <button className="btn ghost" type="button" onClick={loadExample}>가상의 근저당·신탁 사례 보기</button>{" "}
   <button className="btn ghost" type="button" onClick={reset}>모든 선택 초기화</button>
   {example?<p role="status"><strong>가상 시연 데이터입니다.</strong> 실제 매물의 권리관계로 해석하지 마세요.</p>:null}
   {transferNotice?<p role="status">{transferNotice}</p>:null}
  </section>
  <section className="card" aria-label="등기부에서 확인한 기본 항목">
   <h2>2. 빠른 권리관계 체크</h2>
   <p className="meta">원문에서 본 항목을 선택하세요. 선택하지 않은 내용은 권리가 없다는 확인이 아니라 미확인 상태입니다.</p>
   <div className="grid" style={{gap:10}}>
    {flags.map(flag=><label key={flag} style={{display:"flex",alignItems:"flex-start",gap:10}}>
     <input type="checkbox" checked={selected.includes(flag)} onChange={e=>{setSelected(prev=>e.target.checked?[...prev,flag]:prev.filter(x=>x!==flag));setExample(false);}}/>
     <span>{REGISTRY_SIGNALS[flag].title}</span>
    </label>)}
   </div>
   {quick.findings.length>0?<div style={{marginTop:14}}>{quick.findings.map(x=><article className="card" key={x.flag}><strong>{x.title}</strong><p>{x.description}</p><p><b>추가 확인:</b> {x.check}</p></article>)}</div>:<p className="meta">선택한 항목이 없습니다. 안전하다는 의미가 아닙니다.</p>}
  </section>
  <section className="card" aria-label="등기부 권리기재 상세 입력">
   <h2>3. 권리기재 상세 분석 (선택)</h2>
   <p>원문을 보고 현행/말소, 갑구/을구, 순위번호 및 채권최고액을 입력할 수 있습니다. 자동 문서 추출이 아니라 <b>사용자 입력값의 구조화</b>입니다.</p>
   <p className="meta">순위번호와 날짜만으로 법적 우선순위를 자동 판정하지 않습니다. 말소로 입력된 기록도 실제 말소 여부를 공식 원문으로 확인하세요.</p>
   {rights.map((entry,index)=><article className="card" key={entry.id} style={{marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
     <strong>기재 {index+1}</strong>
     <button className="btn ghost" type="button" onClick={()=>{setRights(prev=>prev.filter(x=>x.id!==entry.id));setExample(false);}}>삭제</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
     <label>권리 종류<select value={entry.kind} onChange={e=>updateEntry(entry.id,{kind:e.target.value as RightKind})}>
      {rightKinds.map(x=><option value={x} key={x}>{RIGHT_LABELS[x]}</option>)}
     </select></label>
     <label>등기 구분<select value={entry.section} onChange={e=>updateEntry(entry.id,{section:e.target.value as RightSection})}>
      <option value="갑구">갑구</option><option value="을구">을구</option><option value="unknown">확인 전</option>
     </select></label>
     <label>기재 상태<select value={entry.status} onChange={e=>updateEntry(entry.id,{status:e.target.value as RightStatus})}>
      {statuses.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
     </select></label>
     <label>등기 접수일 (선택)<input type="date" value={entry.registrationDate??""} onChange={e=>updateEntry(entry.id,{registrationDate:e.target.value})}/></label>
     <label>순위번호 (선택)<input type="number" min="1" step="1" value={entry.rankNumber??""} onChange={e=>updateEntry(entry.id,{rankNumber:optionalNumber(e.target.value)})}/></label>
     {entry.kind==="mortgage"?<label>채권최고액 (만원·선택)<input type="number" min="0" max="100000000" step="1" value={entry.claimMaximumManwon??""} onChange={e=>updateEntry(entry.id,{claimMaximumManwon:optionalNumber(e.target.value)})}/></label>:null}
     {entry.kind==="mortgage"?<label style={{display:"flex",alignItems:"center",gap:8}}>
      <input type="checkbox" checked={entry.jointCollateralMentioned===true} onChange={e=>updateEntry(entry.id,{jointCollateralMentioned:e.target.checked})}/>
      공동담보목록 기재 확인 (사용자 입력)
     </label>:null}
     <label style={{display:"flex",alignItems:"center",gap:8}}>
      <input type="checkbox" checked={entry.cancellationPromised===true} onChange={e=>updateEntry(entry.id,{cancellationPromised:e.target.checked})}/>
      말소하겠다는 약속이 있음 (실제 말소 아님)
     </label>
    </div>
   </article>)}
   <button className="btn" type="button" disabled={rights.length>=50} onClick={addEntry}>+ 기재 항목 추가 ({rights.length}/50)</button>
  </section>
  <section className="card" aria-label="등기 외 확인할 자료">
   <h2>4. 등기 외 추가 확인</h2>
   <p className="meta">등기부만으로 알 수 없는 사실을 구별합니다. 아래 체크는 <b>사용자가 자료를 확인했다고 스스로 기록</b>하는 것이며 플랫폼의 공적 검증이 아닙니다.</p>
   {checkKeys.map(key=><label key={key} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
    <input type="checkbox" checked={checks[key]==="user_checked"} onChange={e=>{setChecks(prev=>({...prev,[key]:e.target.checked?"user_checked":"not_checked"}));setExample(false);}}/>
    <span><b>{REVIEW_CHECKS[key].label}</b><small style={{display:"block"}}>{REVIEW_CHECKS[key].nextAction}</small></span>
   </label>)}
  </section>
  <section className="card" aria-label="권리관계 분석 결과" aria-live="polite">
   <h2>5. 확인사항 결과</h2>
   <p><strong>입력된 현행 근저당권 {structured.activeMortgageCount}건</strong> · 말소로 입력된 기록 {structured.cancelledRecords}건 · 효력 상태 미확인 {structured.unknownStatusRecords}건</p>
   <p>현행 근저당 채권최고액 합산: <strong>{structured.activeMortgageMaximumManwon===null?"금액 미입력·불완전 또는 해당 없음":structured.activeMortgageMaximumManwon.toLocaleString("ko-KR")+"만원"}</strong></p>
   {structured.activeMortgageAmountsMissing?<p className="meta">채권최고액이 입력되지 않은 현행 근저당이 {structured.activeMortgageAmountsMissing}건이므로 합계를 표시하지 않습니다.</p>:null}
   <p>등기 외 사용자 확인 항목: {structured.checkedItems}/{structured.totalCheckItems}</p>
   <p className="meta">이 값으로 채무잔액·보증금 회수액·선순위 총액·거래 안전등급을 계산하지 않습니다.</p>
   <div className="grid" style={{gap:12}}>
    {structured.findings.map(f=><article className="card" key={f.id}>
     <span className="meta">{f.level==="attention"?"권리기재 주의":f.level==="verify"?"추가 확인":"참고"}</span>
     <h3>{f.title}</h3><p>{f.detail}</p><p><b>다음 단계:</b> {f.nextAction}</p>
    </article>)}
   </div>
   {structured.notes.map(x=><p className="meta" key={x}>{x}</p>)}
   <button className="btn ghost" type="button" onClick={()=>void copy()}>확인 메모 복사 (사용자 선택)</button>
   {copyNotice?<p role="status">{copyNotice}</p>:null}
  </section>
  {shareListingId?<section className="card" aria-label="이 매물에 정형 권리기재 후보 공유">
   <span className="eyebrow">P14 · OWNER-REVIEWED EVIDENCE</span>
   <h2>이 매물에 권리기재 참고 정보를 공유하기</h2>
   <p>지금 화면에서 선택한 권리 종류·갑구/을구·순위·채권최고액·등기일만 공개됩니다. 실제 PDF 원문, 인물명, 주소와 개인정보, 자유 메모는 저장하지 않습니다.</p>
   <p className="meta">공유된 권리는 모두 <strong>현행·말소 효력 미확인</strong>으로 표시됩니다. 내가 표시한 말소 여부, '자료를 확인했다'는 체크가 플랫폼의 법적 인증이 되지는 않습니다.</p>
   <label style={{display:"flex",gap:9,alignItems:"center",marginBottom:9}}><input type="checkbox" checked={shareConsent}
     onChange={e=>setShareConsent(e.target.checked)}/>이 매물의 등록 계정이며 해당 정형 권리정보를 공개하기로 선택했습니다.</label>
   <label style={{display:"flex",gap:9,alignItems:"center",marginBottom:9}}><input type="checkbox" checked={acceptUnverified}
     onChange={e=>setAcceptUnverified(e.target.checked)}/>공식 소유권 확인·법률 검토·안전 보증이 아님을 이해했습니다.</label>
   <button className="btn" type="button" disabled={sharing||example||!shareConsent||!acceptUnverified||rights.length<1||rights.length>20}
     onClick={()=>void share()}>{sharing?"공유 중...":"선택한 권리기재 요약 공유하기"}</button>
   {example?<p className="meta">가상 예시는 실제 매물에 공유할 수 없습니다.</p>:null}
   {shareNotice?<p role="status">{shareNotice}</p>:null}
   <a className="btn ghost" href={"/listings/"+encodeURIComponent(shareListingId)+"#registry-rights"}>매물 상세에서 안내 확인 →</a>
  </section>}
 </div>;
}
