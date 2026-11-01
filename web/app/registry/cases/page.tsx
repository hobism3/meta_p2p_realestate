"use client";

import {useMemo,useState} from "react";
import corpusRaw from "../../../tests/fixtures/registry-cases.v1.json";
import {reviewRegistryRights,type RightsReviewInput} from "../../../lib/registry-rights-analysis";

type RegistryCase={
 id:string;title:string;category:string;detectability:string;
 provenance:string;sourceIds:string[];note:string;
 input:RightsReviewInput;
 expected:{
  activeMortgageCount:number;activeMortgageMaximumManwon:number|null;
  activeMortgageAmountsMissing:number;cancelledRecords:number;
  unknownStatusRecords:number;requiredFindingIds:string[];forbiddenFindingIds:string[];
 };
};
const corpus=corpusRaw as unknown as {
 schema:string;fixtures:RegistryCase[];sourceIds:Record<string,string>;
};
const categories:Record<string,string>={
 baseline:"정상 기준·자료 품질",mortgage:"근저당·공동담보",dispute:"압류·가압류·경매·가등기",
 ownership:"신탁·게시권한",lease:"임차권·선순위 임차인",external:"등기 외 위험",
 timing:"계약·말소 시점",composite:"복합 권리관계",
};
const detectionLabels:Record<string,string>={
 "title-record":"등기기재에 나타날 수 있는 신호",
 "cross-document":"다른 문서와의 대조 필요",
 "outside-registry":"등기부만으로 확인할 수 없음",
 "timing":"권리 발생·계약 시점 비교 필요",
 "composite":"여러 기재를 동시에 검토",
 "data-quality":"문서/입력 정확성 검토",
};
const fixtureData=corpus.fixtures;

export default function RegistryCasebookPage(){
 const [category,setCategory]=useState("all");
 const [selectedId,setSelectedId]=useState("P8-001");
 const filtered=useMemo(()=>fixtureData.filter(x=>category==="all"||x.category===category),[category]);
 const selected=fixtureData.find(x=>x.id===selectedId)??fixtureData[0];
 const actual=useMemo(()=>reviewRegistryRights(selected.input),[selected]);
 const ids=useMemo(()=>new Set(actual.findings.map(x=>x.id)),[actual]);
 const missing=selected.expected.requiredFindingIds.filter(x=>!ids.has(x));
 const unexpected=selected.expected.forbiddenFindingIds.filter(x=>ids.has(x));
 const aggregatesMatch=
  actual.activeMortgageCount===selected.expected.activeMortgageCount &&
  actual.activeMortgageMaximumManwon===selected.expected.activeMortgageMaximumManwon &&
  actual.activeMortgageAmountsMissing===selected.expected.activeMortgageAmountsMissing &&
  actual.cancelledRecords===selected.expected.cancelledRecords &&
  actual.unknownStatusRecords===selected.expected.unknownStatusRecords;
 const consistent=aggregatesMatch&&missing.length===0&&unexpected.length===0;

 return <div className="grid owner-page registry-review-page">
  <header className="owner-hero">
   <span>REGISTRY CASEBOOK · SYNTHETIC GOLDEN CASES</span>
   <h1>권리관계 유형별 사례 연구실</h1>
   <p>HUG의 사기예방 사례와 공개 해설 글을 참고해 별도로 구성한 <strong>가상 데이터 {fixtureData.length}건</strong>을 둘러보세요.
     실제 등기부·부동산의 법적 판단 결과나 OCR 추출 테스트가 아닙니다.</p>
   <p>이 화면에서 사례를 선택하면 권리관계 분석 엔진을 브라우저 안에서 실행합니다. 외부 AI·서버·제휴 등기 API는 호출하지 않습니다.</p>
  </header>
  <section className="card">
   <h2>1. 사례 유형 선택</h2>
   <label>시나리오 분류
    <select value={category} onChange={e=>{const next=e.target.value;setCategory(next);const first=fixtureData.find(x=>next==="all"||x.category===next);if(first)setSelectedId(first.id);}}>
     <option value="all">전체 {fixtureData.length}건</option>
     {Object.keys(categories).map(x=><option value={x} key={x}>{categories[x]} ({fixtureData.filter(v=>v.category===x).length}건)</option>)}
    </select>
   </label>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:9,marginTop:14}}>
    {filtered.map(c=><button type="button" key={c.id}
      className={"btn "+(selected.id===c.id?"":"ghost")}
      style={{textAlign:"left",whiteSpace:"normal",justifyContent:"flex-start",fontSize:12}}
      aria-pressed={selected.id===c.id} onClick={()=>setSelectedId(c.id)}>
      {c.id} · {c.title}
    </button>)}
   </div>
  </section>
  <section className="card" aria-live="polite">
   <h2>2. {selected.title}</h2>
   <p className="meta">사례 ID: {selected.id} · {categories[selected.category]??selected.category} · {detectionLabels[selected.detectability]??selected.detectability}</p>
   <p><strong>핵심 관찰:</strong> {selected.note}</p>
   <p className="meta">아래 수치는 원본 서류에서 자동 추출한 값이 아니라 예시를 위해 만든 가상 입력값입니다. 데이터가 없으면 '없음'이 아니라 '미확인'으로 해석해야 합니다.</p>
   <div style={{display:"flex",gap:15,flexWrap:"wrap"}}>
    <div><b>입력 근저당 {actual.activeMortgageCount}건</b></div>
    <div><b>채권최고액 입력 합계: {actual.activeMortgageMaximumManwon===null?"미확인 또는 불완전":actual.activeMortgageMaximumManwon.toLocaleString("ko-KR")+"만원"}</b></div>
    <div>말소로 입력: {actual.cancelledRecords}건</div>
    <div>효력 불명: {actual.unknownStatusRecords}건</div>
   </div>
   <p><strong>골든 회귀 점검:</strong> {consistent?"예상 근거·수치와 일치":"차이 발견 — 실제 로그/테스트 검토 필요"}</p>
   {consistent?<p className="meta">여기서 일치한다는 의미는 정형 입력에 대한 규칙 회귀 테스트이며 법률적 안전성 검증이 아닙니다.</p>:<p role="alert">수치 기대값 일치: {String(aggregatesMatch)} / 누락된 발견: {missing.join(", ")||"없음"} / 예상치 못한 발견: {unexpected.join(", ")||"없음"}</p>}
   <h3>사용자 입력으로 가정한 권리기재</h3>
   {selected.input.rights.length===0?<p>권리기재 입력 없음 — 실제 등기에 제한사항이 없다는 증거는 아닙니다.</p>:
    <div className="grid" style={{gap:9}}>{selected.input.rights.map((x,index)=><div className="card" key={x.id+"-"+index}>
     <strong>{index+1}. {x.kind} · {x.section} · {x.status}</strong>
     <p className="meta">채권최고액: {x.claimMaximumManwon==null?"미입력":x.claimMaximumManwon+"만원"} · 접수일: {x.registrationDate||"미입력"} · 순위번호: {x.rankNumber??"미입력"}</p>
     {x.jointCollateralMentioned?<p>공동담보 관련 기재가 있다는 사용자 입력</p>:null}
     {x.cancellationPromised?<p>말소를 약속했다는 사용자 입력 (등기말소 아님)</p>:null}
    </div>)}</div>}
  </section>
  <section className="card">
   <h2>3. 분석기의 확인사항 ({actual.findings.length})</h2>
   {actual.findings.map(x=><article key={x.id} className="card" style={{marginBottom:10}}>
    <span className="meta">{x.level==="attention"?"권리기재 주의":x.level==="verify"?"추가 증빙 필요":"참고"} · {x.id}</span>
    <h3>{x.title}</h3><p>{x.detail}</p><p><b>다음 확인:</b> {x.nextAction}</p>
   </article>)}
   {actual.notes.map(n=><p className="meta" key={n}>{n}</p>)}
  </section>
  <section className="card">
   <h2>4. 이 사례의 조사 출처</h2>
   <p>실제 사건 기록·법원 증명서가 아닌 외부 교육자료의 **유형을 참고**했습니다. 교육용 PDF·주석 이미지를 임의 재배포하지 않습니다.</p>
   {selected.sourceIds.map(id=><p key={id}><a href={corpus.sourceIds[id]} target="_blank" rel="noopener noreferrer">출처 {id} ↗</a></p>)}
   <p className="meta">38개 시나리오의 근거 및 미검증 항목은 Git의 docs/registry-cases/CASE_CATALOG_20261101.md에 기록됩니다. 문서 인식 정확도와 법률 판정 정확도는 별도로 검증해야 합니다.</p>
   <a className="btn ghost" href="/registry/check">내가 확인한 등기 사항으로 점검하기</a>
  </section>
 </div>;
}
