"use client";
/** Judge walkthrough: bilingual static guidance. No live AI call on page load. */
import { useUiLocale } from "../../lib/ui-locale";

const copy = {
 ko: {
  heroLabel:"BUILT FOR YOUR WORLD · DEMONSTRATION",
  heroTitle1:"내 집을 올리는 순간부터", heroTitle2:"다음 확인까지, ", heroTitleEm:"하나의 흐름.",
  hero:"DirectHome은 집주인의 반복 문의를 AI로 돕고, 집톡이가 당사자 사이의 확인 사항을 정리하는 한국형 부동산 직거래 PoC입니다. 여기서 직접 기능을 따라가 볼 수 있습니다.",
  demoLink:"2분 시연 순서 보기", pdfLink:"등기 PDF 로컬 분석",
  warning:"가상 매물·Mock AI 시연과 실제 사용자 거래를 구별합니다. 공인 중개, 본인·소유권 인증, 법적 계약/보증금 반환 보증 서비스가 아닙니다.",
  journey:"집주인 · 방문자 · 집톡이가 함께 이어가는 4단계",
  roles:[
   {role:"집주인",title:"매물 등록과 사진 정리",description:"5단계 등록 → 가상 등기 예시 또는 사용자 파일로 필드 초안 → 사진에서 옵션 후보·빠진 공간 안내 → 게시용 사진은 별도 확인·동의.",href:"/register",action:"매물 등록 시작",note:"사진 AI·이미지 생성은 선택 기능이며 실모델 성능과 게시권한은 아직 인증되지 않았습니다."},
   {role:"집주인",title:"AI 임대인 설정과 방문 가능 시간",description:"본인이 확인한 정책만 AI에 제공해 반복 문의에 응답하고, 확인이 필요한 질문은 집주인 작업함으로 보냅니다. 방문 요청은 집주인 승인 전까지 확정되지 않습니다.",href:"/owner",action:"집주인 업무 허브",note:"로그인한 등록 계정의 매물에만 접근할 수 있습니다. 실제 신원/소유권 인증은 별도입니다."},
   {role:"집을 구하는 사람",title:"지도·매물·등기 권리 참고정보",description:"가격·옵션·게시자의 사진을 살펴보고 등기사항증명서의 공개된 권리기재 후보와 별도 확인 항목을 확인합니다. 가상 매물은 AI 시연 이미지라고 명확히 표시합니다.",href:"/listings/s02",action:"가상 매물 상세 보기",note:"권리 후보는 법적 위험등급이나 보증금 안전 보증이 아닙니다. 이 매물은 합성 시연입니다."},
   {role:"양측 + 집톡이",title:"문의·방문·조건 확인·계약 준비",description:"실제 거래방에서는 양측 확인 카드로 같은 버전에 각각 동의해야 앱 내 조건이 확인됩니다. 집톡이는 미확인 항목과 다음 절차를 안내하며 가격을 흥정하지 않습니다.",href:"/rooms",action:"내 거래방 열기",note:"실사용자 간 계약, 법적 효력, 송금 및 현장 방문을 플랫폼이 대신 확정하지 않습니다."}
  ],
  start:"원하는 입장에서 바로 시작하세요",
  intro:"아래 버튼은 설명 화면이 아닌 실제 서비스의 해당 기능으로 이동합니다. 예시 영상이나 키·유료 모델 호출이 필요 없습니다.",
  scenarios:[
   {name:"시연 A · 집을 찾는 입장",eta:"2~3분",steps:["합성 매물 s02 선택","AI 시연 임대인에게 보증금·입주일 문의","집톡이의 확인 전 조건과 다음 단계 살펴보기"],href:"/listings/s02",action:"합성 매물로 체험"},
   {name:"시연 B · 집주인 입장",eta:"3~4분",steps:["매물 등록 마법사와 사진 정보 정리","등록한 매물의 AI 응대/방문 시간 설정","공개 갤러리 관리와 집주인 작업함 보기"],href:"/register",action:"집주인 등록 체험"},
   {name:"시연 C · 권리분석",eta:"2분",steps:["공개 교육용 가상 등기 PDF 선택","브라우저 로컬 텍스트층 추출·권리 후보 확인","등기부 원문/말소/선순위 재확인 항목 확인"],href:"/registry/extract",action:"교육용 등기 PDF 분석"}
  ],
  guard:"AI가 돕는 일과 사람이 결정하는 일",aiRole:"AI가 하는 일",aiText:"사진의 공간·옵션 후보 제안, 공개된 매물 사실 응대, 합의 전후의 차이 안내, 등기 권리기재 후보·추가 확인서류 표시.",
  humanRole:"사람이 하는 일",humanText:"사진 공개 승인, 방문 승인, 동일 조건 버전별 양측 동의, 원본 등기·실명·임대권한 확인, 계약서 검토·서명·송금.",
  rights:"권리 확인 체크리스트",login:"로그인/회원가입",
  foot:"공개 등기 PDF 교육용 사례와 반복 테스트는 개발 단계의 일부입니다. 원문 이미지 말소선, 실제 계약 효력, 외부 본인확인기관과의 연결은 별도로 검증해야 합니다.",
  languageHint:"한국어와 영어 시연 안내를 전환할 수 있습니다. 실제 거래 입력은 한국어 중심입니다."
 },
 en: {
  heroLabel:"BUILT FOR YOUR WORLD · LIVE PRODUCT WALKTHROUGH",
  heroTitle1:"From listing a home", heroTitle2:"to the next decision — ", heroTitleEm:"one clear journey.",
  hero:"DirectHome is a Korean peer-to-peer real estate prototype. Meta-powered tools help owners prepare listings and respond to routine questions, while a neutral companion tracks what both parties actually confirmed.",
  demoLink:"Jump to guided demo",pdfLink:"Explore local registry PDF analysis",
  warning:"Prototype only: seeded listings and scripted/Mock AI must not be mistaken for real properties or verified model behavior. This is not brokerage, identity/ownership verification, legal advice, an enforceable contract, or a deposit guarantee.",
  journey:"Four steps · owner, visitor, and a neutral assistant",
  roles:[
   {role:"Owner",title:"Create a listing with photo assistance",description:"Create a five-step listing draft. Optionally extract editable fields from a fictional registry PDF; then inspect photo-based room labels, candidate amenities, missing photo coverage, and consent-based photo publication.",href:"/register",action:"Start listing a home",note:"AI suggestions are never silently added as facts. Meta model calls require separate opt-in."},
   {role:"Owner",title:"Set up an AI owner assistant",description:"Answer recurring questions using owner-provided facts. Unanswered requests go into the owner inbox. Visit bookings require owner approval.",href:"/owner",action:"Open owner hub",note:"Owners must sign in to edit their own listings. Identity and property authority are not formally verified."},
   {role:"Visitor",title:"Browse homes and rights evidence",description:"Explore map/list results, clearly labeled synthetic listings, and owner-published photos. Registry facts are unverified references for further human checks.",href:"/listings/s02",action:"Explore a demo listing",note:"Registry evidence is not a legal risk grade or deposit safety assurance."},
   {role:"Both parties + Jiptok",title:"Talk, confirm terms, track next steps",description:"The neutral assistant highlights unresolved conditions and asks both parties to confirm the same proposal version. It never bargains on their behalf.",href:"/rooms",action:"Open deal rooms",note:"No contract, payment, signature, or real reservation is finalized by the platform."}
  ],
  start:"Choose your demo path",
  intro:"These links open actual implemented product routes. The guide itself does not call a paid Meta model or submit data.",
  scenarios:[
   {name:"Demo A · Home seeker",eta:"2–3 min",steps:["Open fictional listing s02","Ask the clearly labeled demo AI owner about rent or move-in","Inspect Jiptok's open items and next actions"],href:"/listings/s02",action:"Explore demo home"},
   {name:"Demo B · Property owner",eta:"3–4 min",steps:["Complete the listing wizard and photo flow","Set owner AI boundaries and visit times","Review published gallery and pending tasks"],href:"/register",action:"Try owner listing"},
   {name:"Demo C · Registry evidence",eta:"2 min",steps:["Select a publicly available educational title-record PDF","Extract text locally in the browser and review candidate rights","Check caveats about cancellations and senior liens"],href:"/registry/extract",action:"Analyze educational PDF"}
  ],
  guard:"AI assists; people decide",aiRole:"What AI helps with",aiText:"Suggest candidate rooms and visible amenities, reply from owner-approved facts, summarize unresolved deal steps, and surface registry evidence for review.",
  humanRole:"What humans decide",humanText:"Approve photo publication and visit appointments; explicitly agree to the same terms; verify real identities, property rights, contracts, signatures, and payments.",
  rights:"Rights verification checklist",login:"Log in / Sign up",
  foot:"Educational registry fixtures and isolated automated tests prove workflow behavior, not actual legal protection, OCR accuracy, ownership, or full model reliability.",
  languageHint:"EN translates this walkthrough and key navigation. Transaction and data-entry flows remain Korean-first."
 }
} as const;
export default function ShowcasePage(){
 const {locale,choose}=useUiLocale();
 const t=copy[locale];
 return <main className="showcase" aria-label={locale==="en"?"DirectHome guided demo":"DirectHome 통합 체험 가이드"}>
  <div className="showcase-language-bar" role="group" aria-label="Demo language">
   <span>{locale==="en"?"Demo language":"시연 언어"}</span>
   <button type="button" className={locale==="ko"?"is-selected":""} aria-pressed={locale==="ko"} onClick={()=>choose("ko")}>한국어</button>
   <button type="button" className={locale==="en"?"is-selected":""} aria-pressed={locale==="en"} onClick={()=>choose("en")}>English</button>
  </div>
  <header className="showcase-hero">
   <span className="eyebrow">{t.heroLabel}</span>
   <h1>{t.heroTitle1}<br/>{t.heroTitle2}<em>{t.heroTitleEm}</em></h1>
   <p>{t.hero}</p>
   <div className="showcase-actions"><a className="btn" href="#scenarios">{t.demoLink} →</a>
    <a className="btn ghost" href="/registry/extract">{t.pdfLink}</a></div>
   <p className="showcase-warning">{t.warning}</p>
  </header>
  <section className="showcase-section" aria-label={locale==="en"?"User journeys":"사용자별 거래 여정"}>
   <span className="eyebrow">FROM LISTING TO NEXT ACTION</span>
   <h2>{t.journey}</h2>
   <div className="showcase-step-grid">{t.roles.map((step,index)=>
    <article className="card showcase-step" key={index}>
     <div className="showcase-step-heading"><span className="showcase-step-num">{String(index+1).padStart(2,"0")}</span><small>{step.role}</small></div>
     <h3>{step.title}</h3><p>{step.description}</p>
     <p className="meta">{step.note}</p>
     <a className="btn ghost" href={step.href}>{step.action} ↗</a>
    </article>)}</div>
  </section>
  <section className="showcase-section" id="scenarios" aria-label={locale==="en"?"Guided demo scenarios":"선택형 시연 시나리오"}>
   <span className="eyebrow">DEMO PLAYBOOK</span><h2>{t.start}</h2>
   <p>{t.intro}</p>
   <div className="showcase-scenario-grid">{t.scenarios.map(s=>
    <article className="card showcase-scenario" key={s.name}>
     <div className="showcase-scenario-head"><h3>{s.name}</h3><span className="badge">{s.eta}</span></div>
     <ol>{s.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
     <a className="btn" href={s.href}>{s.action} ↗</a>
    </article>)}</div>
  </section>
  <section className="card showcase-guardrail" aria-label={locale==="en"?"AI roles and limits":"AI 역할과 검증 범위"}>
   <span className="eyebrow">BUILT TO ASSIST · NOT TO DECIDE</span>
   <h2>{t.guard}</h2>
   <div className="showcase-scenario-grid">
    <div><h3>{t.aiRole}</h3><p>{t.aiText}</p></div>
    <div><h3>{t.humanRole}</h3><p>{t.humanText}</p></div>
   </div>
   <div className="showcase-actions">
    <a className="btn ghost" href="/registry/check">{t.rights} ↗</a>
    <a className="btn ghost" href="/login">{t.login} ↗</a>
   </div>
   <p className="meta">{t.foot}</p>
   <p className="showcase-language-note">{t.languageHint}</p>
  </section>
 </main>;
}
