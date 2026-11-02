"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {extractRegistryPdfLocally} from "../../../lib/registry-pdf-local-reader";
import {auditIndependentRightsRows} from "../../../lib/registry-independent-row-audit";
import samples from "../../../tests/fixtures/registry-text-layer.v1.json";
import publicEducationalSamples from "../../../tests/fixtures/registry-public-sources.v1.json";
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
  {candidate.entry.kind==="mortgage"?<p>채권최고액 후보: <strong>{candidate.entry.claimMaximumManwon==null?"추출 불가":candidate.entry.claimMaximumManwon.toLocaleString("ko-KR")+"만원"}</strong>
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
 const [pdfProgress,setPdfProgress]=useState("");
 const [pdfWarnings,setPdfWarnings]=useState<string[]>([]);
 const [pdfStats,setPdfStats]=useState("");
 const [incompletePdf,setIncompletePdf]=useState(false);
 const requestId=useRef(0);
 useEffect(()=>{
  if(!pdf){setLocalUrl("");return;}
  const url=URL.createObjectURL(pdf);
  setLocalUrl(url);
  return ()=>URL.revokeObjectURL(url);
 },[pdf]);

 const approved=useMemo(()=>(parsed?.candidates??[]).filter(c=>reviews[c.id]?.read),[parsed,reviews]);
 const independentAudit=useMemo(()=>parsed?auditIndependentRightsRows(text,parsed):null,[text,parsed]);
 const uncoveredRights=Boolean(independentAudit&&independentAudit.missingInPrimary>0);
 const loadSample=(id:string)=>{
  const sample=sampleCases.find(c=>c.id===id);
  if(!sample)return;
  requestId.current++;
  setPdf(null);setChosenExample(id);setText(sample.text);
  setParsed(null);setReviews({});setError("");setBusy(false);
  setPdfProgress("");setPdfWarnings([]);setPdfStats("");setIncompletePdf(false);
 };
 const clear=()=>{
  requestId.current++;
  setPdf(null);setLocalUrl("");setText("");setParsed(null);setReviews({});
  setChosenExample("");setError("");setBusy(false);setPdfProgress("");
  setPdfWarnings([]);setPdfStats("");setIncompletePdf(false);
 };
 const choosePdf=async(file:File|null)=>{
  const ticket=++requestId.current;
  setPdf(null);setText("");setError("");setParsed(null);setReviews({});setChosenExample("");
  setPdfProgress("");setPdfWarnings([]);setPdfStats("");setIncompletePdf(false);
  if(!file){setBusy(false);return;}
  if(!/\.pdf$/i.test(file.name)||file.size>8*1024*1024||file.size<100){
   setError("8MB 이하의 PDF만 브라우저에서 열 수 있습니다. 파일은 전송되지 않았습니다.");
   return;
  }
  setPdf(file);setBusy(true);setPdfProgress("PDF.js 로컬 텍스트층 준비 중");
  try{
   const layout=await extractRegistryPdfLocally(file,(n,total)=>{
    if(requestId.current===ticket)setPdfProgress(n+"/"+total+"페이지 텍스트 복원 중");
   });
   if(requestId.current!==ticket)return;
   setPdfWarnings(layout.warnings);
   setPdfStats(layout.pages+"페이지 · "+layout.items+"개 문자 객체 · "+layout.lines+"개 복원 행");
   if(!layout.text.trim()||layout.items===0){
    setError("PDF에서 선택 가능한 글자를 찾지 못했습니다. 스캔형 문서는 현재 OCR을 지원하지 않습니다.");
    return;
   }
   setText(layout.text);
   if(layout.pagesWithoutText.length>0){
    setIncompletePdf(true);
    setError("텍스트층이 없는 페이지가 있습니다. 누락된 권리관계를 배제할 수 없어 자동 분석·전달을 중단합니다.");
    return;
   }
   const result=extractRegistryText(layout.text);
   setParsed(result);
   if(result.documentKind==="unrecognized")
    setError("PDF 텍스트는 추출했지만 갑구·을구 구조를 확인하지 못했습니다. 원문을 직접 확인하세요.");
   setPdfProgress("브라우저 로컬 텍스트 추출 완료");
  }catch{
   if(requestId.current===ticket)setError("PDF 로컬 텍스트 추출에 실패했습니다. 암호화·파손·스캔본이거나 지원하지 않는 PDF일 수 있습니다.");
  }finally{
   if(requestId.current===ticket)setBusy(false);
  }
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
  if(incompletePdf){setError("텍스트층이 누락된 페이지가 있어 후보를 P8로 가져올 수 없습니다.");return;}
  if(uncoveredRights){setError("독립적인 권리행 탐색에서 현재 목록에 없는 기재가 발견됐습니다. 불완전한 목록을 전달하지 않습니다.");return;}
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
  <header className="owner-hero"><span>P10 · LOCAL PDF TEXT-LAYER READER</span>
   <h1>등기 권리기재 후보 추출</h1>
   <p><strong>PDF를 선택하면</strong> 브라우저에 포함된 PDF.js로 글자와 페이지·좌표를 추출해 권리기재 후보를 자동 정리합니다. 결과는 사람이 원문과 대조한 후에만 점검 화면으로 전달할 수 있습니다.</p>
   <p><strong>복사 가능한 텍스트층만 읽습니다.</strong> 스캔 이미지 OCR·취소선의 법적 효력·문서 진위는 판정하지 않습니다. PDF·텍스트는 서버·Meta 모델로 전송하지 않습니다.</p>
  </header>
  <section className="card">
   <h2>1. PDF 자동 텍스트 추출 (브라우저 안에서만)</h2>
   <p>PDF 선택 후 별도 업로드 없이 로컬 텍스트층을 분석합니다. 개인정보가 담긴 PDF는 원문 대조 후 화면의 텍스트·결과 삭제를 사용해 지우세요.</p>
   <label style={{display:"grid",gap:8}}>
    PDF 선택 → 자동 글자 추출·행 복원 (서버 전송 없음)
    <input type="file" aria-label="로컬 PDF 파일 선택" accept="application/pdf,.pdf" disabled={busy} onChange={ev=>void choosePdf(ev.target.files?.[0]??null)}/>
   </label>
   {pdf&&localUrl?<div style={{marginTop:12}}>
    <p><strong>{pdf.name}</strong> · {Math.round(pdf.size/1024)}KB · 브라우저 로컬</p>
    <a className="btn ghost" href={localUrl} target="_blank" rel="noopener noreferrer">원본 PDF 새 탭에서 대조하기 ↗</a>
    <p className="meta">글자가 누락되거나 레이아웃이 섞이면 원문을 직접 확인하세요. 스캔형 PDF에는 OCR이 없으므로 완전한 분석을 진행하지 않습니다.</p>
   </div>:null}
   {pdfProgress?<p className="meta" role="status">{busy?"PDF 처리 중: ":""}{pdfProgress}</p>:null}
   {pdfStats?<p className="meta"><strong>추출 규모:</strong> {pdfStats}</p>:null}
   {pdfWarnings.map((w,i)=><p role="note" className="meta" key={i}>⚠ {w}</p>)}
   <p className="meta">PDF 구조가 불분명하면 아래 텍스트를 직접 수정할 수 있습니다. [PAGE 1]처럼 페이지 구분을 표시할 수 있으며 자동 추출 결과를 공식 권리기록으로 인증하지 않습니다.</p>
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
   <h2>P11 · 공개 교육용 가상 등기부 PDF 5종</h2>
   <p>실제로 게시자가 공개한 <strong>교육용 가상 문서</strong>입니다. 원본 페이지로 이동해 내려받은 다음, 위 PDF 선택란에서 로컬 분석을 시험할 수 있습니다. 실제 부동산 등기사항증명서가 아닙니다.</p>
   <div className="grid" style={{gap:10}}>
    {publicEducationalSamples.references.map(s=>(
     <div key={s.id} style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:8,padding:"10px 12px",border:"1px solid var(--line)",borderRadius:12}}>
      <span><strong>{s.id.replace("DANGDANG-","")}</strong><br/><small className="meta">{s.expectedDescription}</small></span>
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn ghost">공개 원본 PDF 보기 ↗</a>
     </div>
    ))}
   </div>
   <p className="meta" style={{marginTop:10}}>5종 원본 URL·SHA-256 및 임시 CI 재검증 결과는 P11 출처 원장에서 관리합니다. 원본은 우리 서버·Meta로 전송되지 않으며, 다운로드한 교육용 PDF의 재배포/상업적 활용 허락까지 의미하지 않습니다. 원본의 모든 권리·효력을 자동으로 확정하지 않습니다.</p>
  </section>
  <section className="card">
   <h2>2. 자동 추출된 텍스트 확인 또는 직접 붙여넣기</h2>
   <label htmlFor="registry-pasted-text">복사된 문자 자료 (최대 {REGISTRY_TEXT_MAX_CHARS.toLocaleString("ko-KR")}자)</label>
   <textarea id="registry-pasted-text" spellCheck={false}
    style={{width:"100%",minHeight:225,padding:14,border:"1px solid #cbdad2",borderRadius:10,font:"inherit",lineHeight:1.5}}
    maxLength={REGISTRY_TEXT_MAX_CHARS+1}
    placeholder={"【갑 구】 소유권에 관한 사항\n1 | 가압류 | 2026.01.01\n【을 구】 소유권 이외의 권리에 관한 사항\n1 | 근저당권설정 | 2026.02.01 | 채권최고액 금1억2천만원정"}
    value={text} onChange={ev=>{requestId.current++;setBusy(false);setPdfProgress("");setText(ev.target.value);setParsed(null);setReviews({});setError("");setChosenExample("");}}/>
   <p className="meta">이 텍스트는 저장하지 않습니다. 원본의 주소·성명·개인번호가 복사됐을 수 있으므로 공유하거나 Git·로그에 붙이지 마세요. 결과에는 허용된 권리정보만 표시합니다.</p>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <button className="btn" onClick={parse} disabled={busy||incompletePdf||text.trim().length<10||text.length>REGISTRY_TEXT_MAX_CHARS}>직접 수정한 텍스트로 다시 분석하기</button>
    <button className="btn ghost" onClick={clear}>텍스트·결과 삭제</button>
   </div>
   {error?<p role="alert" className="error">{error}</p>:null}
  </section>
  {parsed?<section className="card" aria-live="polite">
   <h2>3. 후보 {parsed.candidates.length}건 검토</h2>
   <p>구조 인식: <strong>{parsed.documentKind==="registry_like"?"갑구/을구 표제 확인":"등기부 형식 불명"}</strong> · 읽은 텍스트 {parsed.coverage.linesRead}줄 · 말소 언급 {parsed.cancellationMentions}건 · 연결되지 않은 말소 언급 {parsed.coverage.unresolvedCancellationRows}건</p>
   <p className="meta">원본 PDF의 취소선·표 셀 위치가 복사 과정에서 사라질 수 있으므로 기계가 자동으로 현행/말소를 확정하지 않습니다.</p>
   {independentAudit?<div role="note" style={{padding:"10px 12px",border:"1px solid #d6dcd8",borderRadius:10,marginBottom:10}}>
    <strong>P12 · 별도 번호/권리기재 탐색:</strong>{" "}
    눈에 보이는 번호 권리행 {independentAudit.observedRightRows}건 · 기존 후보와 일치 {independentAudit.matched}건
    {independentAudit.missingInPrimary>0?<p><strong>주의:</strong> 기존 후보에서 빠진 권리기재가 {independentAudit.missingInPrimary}건 탐지돼 자료 전달을 차단했습니다. PDF 원문을 확인하세요.</p>:null}
    {independentAudit.notIndependentlyConfirmed>0?<p>독립 탐색에서 확인되지 않은 기존 후보 {independentAudit.notIndependentlyConfirmed}건. 원문에 실제로 번호가 있는지 확인하세요.</p>:null}
    {independentAudit.complexSubrankRows>0?<p>부기번호가 있는 행 {independentAudit.complexSubrankRows}건은 별도 검토가 필요합니다.</p>:null}
    <p className="meta">두 탐색 결과가 일치해도 문서 전체의 권리·법적 효력·말소를 검증했다는 뜻은 아닙니다.</p>
   </div>:null}
   {parsed.warnings.map((w,i)=><p className="meta" key={i}>{w}</p>)}
   {parsed.candidates.length===0?<p>후보 행을 찾지 못했습니다. 법적 권리가 없다는 증거가 아닙니다. 갑구·을구를 직접 확인하세요.</p>:null}
   {parsed.candidates.map(c=><CandidateRow key={c.id} candidate={c}
    selection={reviews[c.id]??{read:false,status:"unknown"}}
    onUpdate={next=>setReviews(old=>({...old,[c.id]:next}))}/>)}
   {parsed.candidates.length>0?<div>
    <p>원문 대조 후 선택한 항목: <strong>{approved.length}/{parsed.candidates.length}</strong></p>
    <button className="btn" onClick={transfer} disabled={incompletePdf||uncoveredRights||approved.length===0}>선택한 정형 값만 권리관계 점검으로 가져오기 →</button>
    <p className="meta">가져오는 데이터는 권리종류·상태·등기일·순위번호·채권최고액만 포함합니다. 전체 PDF/복사 텍스트·주소·소유자 이름·근거 문장은 저장하지 않습니다. 가져와도 공식 인증이 아닙니다.</p>
   </div>:null}
  </section>:null}
  <section className="card">
   <h2>4. 추출기의 한계</h2>
   <p>로컬 PDF.js에서 읽은 텍스트층의 <strong>잠정 후보</strong>입니다. 문자 간 좌표 복원만으로 취소선·말소 대상·병합 셀·소유권·실제 효력은 확인할 수 없습니다. PDF의 진위, 최신 등기, 이미지 스캔본, 선순위 임차인·세금, 소유자 신원·위임권한을 확인할 수 없습니다.</p>
   <a className="btn ghost" href="/registry/cases">P8 권리 유형 사례집 보기 ↗</a>{" "}
   <a className="btn ghost" href="/registry/check">직접 권리관계 점검하기 ↗</a>
  </section>
 </div>;
}
