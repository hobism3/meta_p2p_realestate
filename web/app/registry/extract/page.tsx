"use client";
import {useEffect,useMemo,useState} from "react";
import samples from "../../../tests/fixtures/registry-text-layer.v1.json";
import {
 extractRegistryText,REGISTRY_TEXT_MAX_CHARS,
 type RegistryTextCandidate,type RegistryTextExtraction,
} from "../../../lib/registry-text-extraction";
import {REGISTRY_TRANSFER_KEY,toSanitizedTransfer} from "../../../lib/registry-extraction-transfer";
import {RIGHT_LABELS,type RightStatus} from "../../../lib/registry-rights-analysis";

type ReviewSelection={read:boolean;status:RightStatus};
const sampleCases=samples.cases;
const statuses:Array<{value:RightStatus;label:string}>=[
 {value:"unknown",label:"효력 상태 미확인"},
 {value:"active",label:"원문에서 현행 확인"},
 {value:"cancelled",label:"원문에서 말소 확인"},
];

function CandidateRow({candidate,selection,onUpdate}:{
 candidate:RegistryTextCandidate;
 selection:ReviewSelection;
 onUpdate:(state:ReviewSelection)=>void;
}){
 return <article className="card" style={{marginBottom:10}}>
  <h3>{RIGHT_LABELS[candidate.entry.kind]} · {candidate.entry.section} / 순위번호 {candidate.entry.rankNumber??"불명"}</h3>
  <p className="meta">근거 위치: {candidate.evidence.page===null?"페이지 미지정":candidate.evidence.page+"페이지"} · 복사 텍스트 {candidate.evidence.line}번째 줄 · 구조화 후보 {candidate.id}</p>
  <p className="meta">확인된 문자열을 그대로 표시하지 않고, 종류·순위·날짜·금액만 재구성합니다.</p>
  <p><b>추출 후보:</b> {candidate.evidence.label}</p>
  {candidate.entry.kind==="mortgage"?<p>채권최고액 후보: <strong>{candidate.entry.claimMaximumManwon===null?"추출 불가":candidate.entry.claimMaximumManwon.toLocaleString("ko-KR")+"만원"}</strong>
   <small className="meta"> · {candidate.amountEvidence==="same_row"?"같은 행":candidate.amountEvidence==="next_row"?"다음 줄": "근거 누락"}</small></p>:null}
  {candidate.cancellationMentioned?<p role="status"><strong>말소 관련 별도 행이 연결된 것으로 추정됩니다.</strong> 취소선/말소 대상 등기의 실제 효력은 반드시 원본에서 확인하세요.</p>:null}
  {candidate.warnings.map((x,i)=><p key={i} className="meta">{x}</p>)}
  <label style={{display:"grid",gap:5,marginTop:10}}>
   이 등기 항목의 효력을 원문에서 직접 확인하셨나요?
   <select value={selection.status} onChange={ev=>onUpdate({...selection,status:ev.target.value as RightStatus})}>
    {statuses.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}
   </select>
  </label>
  <label style={{display:"flex",alignItems:"flex-start",gap:10,marginTop:10}}>
   <input type="checkbox" checked={selection.read} onChange={ev=>onUpdate({...selection,read:ev.target.checked})}/>
   <span>원본과 대조했습니다. 이 항목만 다음 권리관계 자가점검으로 가져옵니다. (현행/말소의 법적 진위 인증이 아님)</span>
  </label>
 </article>;
}

export default function LocalRegistryTextExtractor(){
 const [pdf,setPdf]=useState<File|null>(null);
 const [localUrl,setLocalUrl]=useState("");
 const [text,setText]=useState("");
 const [parsed,setParsed]=useState<RegistryTextExtraction|null>(null);
 const [reviews,setReviews]=useState<Record<string,ReviewSelection>>({});
 const [error,setError]=useState("");
 const [chosenExample,setChosenExample]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!pdf){setLocalUrl("");return;}
  const url=URL.createObjectURL(pdf);
  setLocalUrl(url);
  return ()=>URL.revokeObjectURL(url);
 },[pdf]);

 const approved=useMemo(()=>(parsed?.candidates??[]).filter(c=>reviews[c.id]?.read),[parsed,reviews]);
 const loadSample=(id:string)=>{
  const sample=sampleCases.find(c=>c.id===id);
  if(!sample)return;
  setPdf(null);setChosenExample(id);setText(sample.text);
  setParsed(null);setReviews({});setError("");
 };
 const clear=()=>{
  setPdf(null);setLocalUrl("");setText("");setParsed(null);setReviews({});
  setChosenExample("");setError("");
 };
 const choosePdf=async(file:File|null)=>{
  setPdf(null);setError("");setParsed(null);setReviews({});setChosenExample("");
  if(!file)return;
  if(!/\.pdf$/i.test(file.name)||file.size>8*1024*1024||file.size<100){
   setError("8MB 이하의 PDF만 브라우저에서 열 수 있습니다. 파일은 전송되지 않았습니다.");
   return;
  }
  const header=new Uint8Array(await file.slice(0,5).arrayBuffer());
  if(String.fromCharCode(...header)!=="%PDF-"){
   setError("PDF 파일의 기본 형식이 일치하지 않습니다.");
   return;
  }
  setPdf(file);
 };
 const parse=()=>{
  if(busy)return;
  setBusy(true);setError("");setReviews({});
  try{
   const result=extractRegistryText(text);
   setParsed(result);
   if(result.documentKind==="unrecognized"){
    setError("등기부 구조를 확인하지 못했습니다. 원문에서 선택한 텍스트인지 확인해 주세요.");
   }
  }catch{
   setParsed(null);setError("복사 텍스트를 해석하지 못했습니다. 원본을 직접 확인하세요.");
  }finally{setBusy(false);}
 };
 const transfer=()=>{
  if(approved.length===0){setError("먼저 원본과 대조한 항목을 하나 이상 선택하세요.");return;}
  try{
   const entries=approved.map(c=>({
    ...c.entry,
    status:reviews[c.id]?.status??"unknown",
   }));
   const payload=toSanitizedTransfer(entries);
   if(payload.rights.length!==approved.length)throw new Error("정형 입력 검증 실패");
   // Not a source document, text, name or address: only allowlisted right fields.
   sessionStorage.setItem(REGISTRY_TRANSFER_KEY,JSON.stringify(payload));
   window.location.assign("/registry/check");
  }catch{
   setError("이 브라우저에서 동일 탭의 입력 전달이 불가능합니다. 개인 정보가 있는 복사 텍스트를 별도로 저장하지 마세요.");
  }
 };
 const statusText=chosenExample?"가상의 테스트용 텍스트를 사용 중입니다. 실제 등기가 아닙니다.":"문서나 텍스트를 서버·Meta에 업로드하지 않습니다.";

 return <div className="grid owner-page registry-review-page">
  <header className="owner-hero"><span>P9 · TEXT-LAYER EVIDENCE WORKBENCH</span>
   <h1>등기 권리기재 후보 추출</h1>
   <p>PDF 뷰어에서 <strong>복사 가능한 표 텍스트</strong>를 선택해 붙여넣으면 권리 종류·채권최고액·등기일·말소 언급을 후보로 정리합니다. 원문 판단은 사람이 하고, 검토한 필드만 자가점검 화면에 가져옵니다.</p>
   <p><strong>현재 단계는 PDF 자동 판독/OCR이 아닙니다.</strong> 입력은 이 탭에서만 처리하며 서버·Meta 모델로 전송하지 않습니다. 사진 분석 기능과 별개입니다.</p>
  </header>
  <section className="card">
   <h2>1. PDF를 내 브라우저에서 열고 텍스트를 복사</h2>
   <p>개인정보가 포함된 실제 등기 원문은 외부 서비스에 제출하지 마세요. 이 도구는 로컬 텍스트 선택 및 분석만 지원합니다.</p>
   <label style={{display:"grid",gap:8}}>
    내 PDF 선택 (로컬 미리보기·서버 전송 없음)
    <input type="file" accept="application/pdf,.pdf" onChange={ev=>void choosePdf(ev.target.files?.[0]??null)}/>
   </label>
   {pdf&&localUrl?<div style={{marginTop:12}}>
    <p><strong>{pdf.name}</strong> · {Math.round(pdf.size/1024)}KB · 브라우저 로컬</p>
    <a className="btn ghost" href={localUrl} target="_blank" rel="noopener noreferrer">이 PDF를 새 탭으로 열어 텍스트 복사 ↗</a>
    <p className="meta">브라우저 PDF 뷰어에서 권리 표의 텍스트를 선택해 복사하세요. 문서에 글자 선택 기능이 없다면 스캔형 PDF일 수 있으며 이번 추출기는 지원하지 않습니다.</p>
   </div>:null}
   <p className="meta">별도 PDF 뷰어를 사용해도 됩니다. 복사할 때 페이지를 구분하려면 [PAGE 1], [PAGE 2]를 줄로 적어주세요. 페이지가 지정되지 않으면 근거 위치에는 줄 번호만 표시됩니다.</p>
   <label style={{display:"grid",gap:8,marginTop:16}}>
    가상 복사 텍스트 실험
    <select value={chosenExample} onChange={ev=>ev.target.value?loadSample(ev.target.value):clear()}>
     <option value="">교육용 가상 사례를 선택해 시연</option>
     {sampleCases.map(s=><option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
    </select>
   </label>
   <p className="meta">{statusText}</p>
  </section>
  <section className="card">
   <h2>2. 등기 표 텍스트 붙여넣기</h2>
   <label htmlFor="registry-pasted-text">복사된 문자 자료 (최대 {REGISTRY_TEXT_MAX_CHARS.toLocaleString("ko-KR")}자)</label>
   <textarea id="registry-pasted-text" spellCheck={false}
    style={{width:"100%",minHeight:225,padding:14,border:"1px solid #cbdad2",borderRadius:10,font:"inherit",lineHeight:1.5}}
    maxLength={REGISTRY_TEXT_MAX_CHARS+1}
    placeholder={"【갑 구】 소유권에 관한 사항\n1 | 가압류 | 2026.01.01\n【을 구】 소유권 이외의 권리에 관한 사항\n1 | 근저당권설정 | 2026.02.01 | 채권최고액 금1억2천만원정"}
    value={text} onChange={ev=>{setText(ev.target.value);setParsed(null);setReviews({});setError("");setChosenExample("");}}/>
   <p className="meta">이 텍스트는 저장하지 않습니다. 원본의 주소·성명·개인번호가 복사됐을 수 있으므로 공유하거나 Git·로그에 붙이지 마세요. 결과에는 허용된 권리정보만 표시합니다.</p>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <button className="btn" onClick={parse} disabled={busy||text.trim().length<10||text.length>REGISTRY_TEXT_MAX_CHARS}>권리기재 후보 찾기</button>
    <button className="btn ghost" onClick={clear}>텍스트·결과 삭제</button>
   </div>
   {error?<p role="alert" className="error">{error}</p>:null}
  </section>
  {parsed?<section className="card" aria-live="polite">
   <h2>3. 후보 {parsed.candidates.length}건 검토</h2>
   <p>구조 인식: <strong>{parsed.documentKind==="registry_like"?"갑구/을구 표제 확인":"등기부 형식 불명"}</strong> · 읽은 텍스트 {parsed.coverage.linesRead}줄 · 말소 언급 {parsed.cancellationMentions}건 · 연결되지 않은 말소 언급 {parsed.coverage.unresolvedCancellationRows}건</p>
   <p className="meta">원본 PDF의 취소선·표 셀 위치가 복사 과정에서 사라질 수 있으므로 기계가 자동으로 현행/말소를 확정하지 않습니다.</p>
   {parsed.warnings.map((w,i)=><p className="meta" key={i}>{w}</p>)}
   {parsed.candidates.length===0?<p>후보 행을 찾지 못했습니다. 법적 권리가 없다는 증거가 아닙니다. 갑구·을구를 직접 확인하세요.</p>:null}
   {parsed.candidates.map(c=><CandidateRow key={c.id} candidate={c}
    selection={reviews[c.id]??{read:false,status:"unknown"}}
    onUpdate={next=>setReviews(old=>({...old,[c.id]:next}))}/>)}
   {parsed.candidates.length>0?<div>
    <p>원문 대조 후 선택한 항목: <strong>{approved.length}/{parsed.candidates.length}</strong></p>
    <button className="btn" onClick={transfer} disabled={approved.length===0}>선택한 정형 값만 권리관계 점검으로 가져오기 →</button>
    <p className="meta">가져오는 데이터는 권리종류·상태·등기일·순위번호·채권최고액만 포함합니다. 전체 PDF/복사 텍스트·주소·소유자 이름·근거 문장은 저장하지 않습니다. 가져와도 공식 인증이 아닙니다.</p>
   </div>:null}
  </section>:null}
  <section className="card">
   <h2>4. 추출기의 한계</h2>
   <p>이 방식은 텍스트 선택이 가능한 PDF의 **표 일부**를 도와주는 보조도구입니다. PDF의 진위, 실제 등기소의 최신 권리관계, 이미지 스캔본, 표 안 취소선, 선순위 임차인·세금, 소유자 신원·위임권한을 확인할 수 없습니다.</p>
   <a className="btn ghost" href="/registry/cases">P8 권리 유형 사례집 보기 ↗</a>{" "}
   <a className="btn ghost" href="/registry/check">직접 권리관계 점검하기 ↗</a>
  </section>
 </div>;
}
