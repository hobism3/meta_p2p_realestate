"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "../../lib/client-auth";
import type { Listing, TradeType } from "../../lib/listings";
import { FEATURE_SUGGESTIONS } from "../../lib/listing-presentation";
import {
  EMPTY_REGISTER_DRAFT, REGISTER_STEPS, firstRegistrationIssue,
  listingPriceLabel, registrationIssue,
  type RegisterDraft, type RegisterStep,
} from "../../lib/register-wizard";
import RegistryImport from "../../components/RegistryImport";
import ListingPhotoGuide from "../../components/ListingPhotoGuide";
import { useUiLocale } from "../../lib/ui-locale";
import { listingFeatureLabel, featureInputDisplay, featureInputCanonical, tradeTypeLabel, englishListingPrice, wonFromManwon, listingUiMessage } from "../../lib/listing-ui-copy";

const STORAGE_KEY = "directhome.register.wizard.v1";
const NUMBER_FIELDS = new Set<keyof RegisterDraft>(["deposit", "rent", "salePrice", "fee", "area"]);
const STAGE_CONTENT = [
  { kicker: "READY TO LIST", title: "내 공간을 소개하는 가장 쉬운 시작", desc: "등기 문서가 있다면 AI가 주소와 면적을 정리해 드려요. 없어도 괜찮습니다." },
  { kicker: "01 · THE SPACE", title: "어떤 공간인가요?", desc: "사람들이 매물을 알아볼 수 있도록 기본 정보를 알려주세요." },
  { kicker: "02 · THE DEAL", title: "어떤 조건으로 거래할까요?", desc: "거래 방식을 고르고, 필요한 금액만 입력하면 됩니다." },
  { kicker: "03 · THE DETAILS", title: "생활 정보를 조금 더 알려주세요.", desc: "입주 일정과 옵션을 추가하면 더 좋은 문의로 이어질 수 있어요." },
  { kicker: "04 · ONE LAST LOOK", title: "등록 전에 한 번만 확인해 주세요.", desc: "입력한 정보를 검토하세요. 마지막 버튼을 누르기 전에는 게시되지 않습니다." },
] as const;
const STAGE_EN = [
  ["The easiest way to introduce your home","If you have a registry PDF, prefill draft fields. You can also start without one."],
  ["Tell us about the space","Enter the basic property information visitors need."],
  ["What are your terms?","Choose a transaction type and enter your preferred amounts."],
  ["Add details and photos","Show availability, amenities, and room photos."],
  ["Review before saving","Check each field. Nothing is published until you submit."],
] as const;
const STEPS_EN = ["Get started","Home","Price","Details & photos","Review"] as const;
function labelValue(value: string, empty = "아직 입력 전"): string {
  return value.trim() || empty;
}

function FormField({
  id, title, value, onChange, placeholder, hint, className = "", inputMode,
}: {
  id: keyof RegisterDraft; title: string; value: string; onChange: (value: string) => void;
  placeholder: string; hint?: string; className?: string; inputMode?: "numeric" | "decimal";
}) {
  return (
    <div className={"field wizard-field " + className}>
      <label htmlFor={id}>{title}</label>
      <input id={id} name={id} type="text" inputMode={inputMode} autoComplete="off"
        value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export default function RegisterPage({ searchParams }: { searchParams: { edit?: string } }) {
  const {tr,en} = useUiLocale();
  const ui = (message: string) => listingUiMessage(message, en);
  const sourceText = (value: string) => en && /[가-힣]/.test(value);
  const displayValue = (value: string) => labelValue(value, tr("아직 입력 전", "Not entered"));
  const editId = searchParams.edit ?? "";
  const [form, setForm] = useState<RegisterDraft>(EMPTY_REGISTER_DRAFT);
  const [stage, setStage] = useState<RegisterStep>(editId ? 1 : 0);
  const [maxVisited, setMaxVisited] = useState<RegisterStep>(editId ? 1 : 0);
  const [hydrated, setHydrated] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Only field values and navigation progress are retained in the current tab.
  // The PDF, upload consent, and model response are never stored here.
  useEffect(() => {
    if (!editId) {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const state = JSON.parse(stored) as { form?: Partial<RegisterDraft>; stage?: number; maxVisited?: number };
          if (state.form && typeof state.form === "object") {
            const next = { ...EMPTY_REGISTER_DRAFT };
            for (const key of Object.keys(next) as Array<keyof RegisterDraft>) {
              const value = state.form[key];
              if (typeof value === "string") next[key] = value as never;
            }
            if (!["월세", "전세", "매매"].includes(next.tradeType)) next.tradeType = "월세";
            setForm(next);
          }
          if (typeof state.stage === "number" && state.stage >= 0 && state.stage <= 4) {
            setStage(state.stage as RegisterStep);
            setMaxVisited(Math.min(4, Math.max(state.stage, state.maxVisited ?? 0)) as RegisterStep);
          }
        }
      } catch { /* Session restore is advisory; never block registration. */ }
    }
    setHydrated(true);
  }, [editId]);

  useEffect(() => {
    if (!hydrated || editId || saved) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ form, stage, maxVisited })); }
    catch { /* Private browsing may disable session storage. */ }
  }, [form, stage, maxVisited, hydrated, editId, saved]);

  useEffect(() => {
    if (!editId) return;
    fetch("/api/listings/" + encodeURIComponent(editId))
      .then((r) => {
        if (!r.ok) { setIsCustom(false); return null; }
        return r.json() as Promise<Listing>;
      })
      .then((l) => {
        if (!l || !l.editable) { setIsCustom(false); return; }
        setIsCustom(true);
        setForm({
          title: l.title, address: l.address, tradeType: l.tradeType,
          deposit: String(l.deposit), rent: String(l.rent), salePrice: String(l.salePrice ?? 0),
          fee: String(l.fee), area: String(l.area), moveIn: l.moveIn,
          options: l.options.join(", "), description: l.description, publisher: l.publisher,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "매물 조회 실패"))
      .finally(() => setLoading(false));
  }, [editId]);

  const set = (key: keyof RegisterDraft, value: string) => {
    const next = NUMBER_FIELDS.has(key) ? value.replace(/,/g, "") : value;
    setForm((previous) => ({ ...previous, [key]: next }));
    setError("");
  };
  const selectedOptions = form.options.split(",").map((value) => value.trim()).filter(Boolean);
  const toggleOption = (option: string) => {
    const excluded = option === "반려동물 가능" ? "반려동물 불가"
      : option === "반려동물 불가" ? "반려동물 가능"
      : option === "확장형" ? "비확장형"
      : option === "비확장형" ? "확장형" : "";
    set("options", selectedOptions.includes(option)
      ? selectedOptions.filter((value) => value !== option).join(", ")
      : [...selectedOptions.filter((value) => value !== excluded), option].join(", "));
  };

  const navigate = (next: RegisterStep) => {
    if (editId && next === 0) return;
    setStage(next);
    setMaxVisited((previous) => Math.max(previous, next) as RegisterStep);
    setError("");
    requestAnimationFrame(() => {
      document.getElementById("listing-wizard-content")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
      document.getElementById("wizard-stage-heading")?.focus({ preventScroll: true });
    });
  };

  const nextStage = () => {
    if (stage === 0) { navigate(1); return; }
    const issue = registrationIssue(form, stage);
    if (issue) {
      setError(issue.message);
      document.getElementById(issue.field)?.focus();
      return;
    }
    if (stage < 4) navigate((stage + 1) as RegisterStep);
  };

  const submit = async () => {
    if (saving) return;
    const issue = firstRegistrationIssue(form);
    if (issue) {
      navigate(issue.step);
      setError(issue.message);
      requestAnimationFrame(() => document.getElementById(issue.field)?.focus());
      return;
    }
    const payload = {
      title: form.title.trim(), address: form.address.trim(), tradeType: form.tradeType,
      deposit: Number(form.deposit || 0), rent: Number(form.rent || 0),
      salePrice: Number(form.salePrice || 0), fee: Number(form.fee || 0),
      area: Number(form.area || 0), moveIn: form.moveIn.trim(),
      options: selectedOptions, description: form.description.trim(), publisher: form.publisher.trim(),
    };
    setSaving(true);
    setError("");
    try {
      const token = process.env.NEXT_PUBLIC_WRITE_TOKEN;
      const res = await fetch(editId ? "/api/listings/" + encodeURIComponent(editId) : "/api/listings", {
        method: editId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-write-token": token } : {}),
          ...authHeaders(),
        },
        body: JSON.stringify(editId ? {
          title: payload.title, description: payload.description, moveIn: payload.moveIn,
          deposit: payload.deposit, rent: payload.rent, salePrice: payload.salePrice,
          fee: payload.fee, area: payload.area, address: payload.address,
          publisher: payload.publisher, options: payload.options,
        } : payload),
      });
      const body = await res.json() as { error?: string; id?: string };
      if (!res.ok) throw new Error(body.error ?? "저장에 실패했습니다.");
      setDoneId(editId || body.id || null);
      setSaved(true);
      if (!editId) {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    if (!window.confirm(tr("이 탭에 임시 저장된 매물 정보를 모두 지울까요?", "Clear all listing details saved in this tab?"))) return;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setForm({ ...EMPTY_REGISTER_DRAFT });
    setStage(0);
    setMaxVisited(0);
    setError("");
    document.getElementById("listing-wizard-content")?.scrollIntoView({ block: "start" });
  };

  if (loading || !hydrated) return <div className="wizard-loading card" role="status">{tr("매물 정보를 준비하고 있어요...","Preparing your listing...")}</div>;
  if (editId && !isCustom) return <div className="card">{tr("시연용 기본 매물은 수정할 수 없습니다.", "Built-in demo listings cannot be edited.")} <a href="/register">{tr("새 매물 등록하기","Create a new listing")}</a></div>;

  const filled = [form.title, form.address, form.area, form.moveIn, form.publisher].filter((value) => value.trim()).length;
  const stageInfo = en ? {...STAGE_CONTENT[stage],title:STAGE_EN[stage][0],desc:STAGE_EN[stage][1]} : STAGE_CONTENT[stage];

  return (
    <div className="listing-wizard-page">
      {!saved ? (
      <>
      <div className="wizard-hero">
        <div>
          <span className="wizard-hero-label"><span className="wizard-label-dot" /> DIRECTHOME STUDIO</span>
          <h1>{editId ? tr("우리 집 정보를 더 정확하게.","Improve your home details") : <>{tr("집을 소개하는 일이","Introducing your home")}<br /><em>{tr("더 쉬워지도록.","made easy.")}</em></>}</h1>
          <p>{tr("필요한 정보만 하나씩. 복잡한 등록을 간결한 과정으로 바꿨어요.","Just the essentials, one step at a time.")}</p>
        </div>
        <div className="wizard-hero-actions">
          <a href="/" className="wizard-back-link">{tr("← 매물 둘러보기","← Explore homes")}</a>
          {!editId ? <button type="button" className="wizard-clear" onClick={resetDraft}>{tr("입력 내용 초기화","Clear draft")}</button> : null}
        </div>
      </div>

      <nav className="wizard-steps" aria-label={tr("매물 등록 진행 단계","Listing progress")}>
        {REGISTER_STEPS.map((item, index) => {
          const current = stage === index;
          const unlocked = (editId ? index >= 1 : true) && index <= maxVisited;
          const complete = index < stage;
          return (
            <button type="button" key={item.label}
              className={"wizard-step " + (current ? "is-active" : complete ? "is-complete" : "")}
              disabled={!unlocked} aria-current={current ? "step" : undefined}
              onClick={() => navigate(index as RegisterStep)}>
              <span className="wizard-step-rail" aria-hidden="true" />
              <span className="wizard-step-index">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <span className="wizard-step-label">{en?STEPS_EN[index]:item.label}</span>
            </button>
          );
        })}
      </nav>
      </>
      ) : null}

      <div className={"wizard-layout" + (saved ? " wizard-layout--saved" : "")}>
        <section id="listing-wizard-content" className="wizard-main" aria-label={saved ? tr("등록 완료 및 사진 게시", "Listing saved and photo publishing") : undefined} aria-labelledby={!saved ? "wizard-stage-heading" : undefined}>
          {saved ? (
            <div className="wizard-success wizard-success--inline" role="status" aria-live="polite">
              <div className="wizard-success-mark" aria-hidden="true">✓</div>
              <span className="eyebrow">LISTING SAVED</span>
              <h1>{editId ? tr("매물 정보를 수정했어요.","Listing updated.") : tr("매물 등록을 마쳤어요.","Listing saved.")}</h1>
              <p>{tr("이제 사진도 마무리해 볼까요? 선택했던 사진은 이 화면에 그대로 남아 있어요. 원한다면 지금 추가할 수도 있습니다.","Finish your photos now. The ones you selected are still here.")}</p>
              <div className="wizard-success-next">
                <span className="wizard-success-next-num" aria-hidden="true">02</span>
                <div>
                  <strong>{tr("사진 확인 · 공개","Review & publish photos")}</strong>
                  <small>{tr("개인정보를 확인하고, 공개할 사진만 직접 선택해 주세요.","Choose only photos you have reviewed for public display.")}</small>
                </div>
                <a className="btn" href="#after-register-photos">{tr("사진 마무리하기 ↓","Finish photos ↓")}</a>
              </div>
              <div className="wizard-success-actions">
                {doneId ? <a className="btn ghost" href={"/listings/" + doneId}>{tr("완성된 매물 보기 ↗","View listing ↗")}</a> : null}
                {doneId ? <a className="btn ghost" href={"/owner/listings/" + doneId}>{tr("집주인 관리 · AI 설정 →","Owner hub →")}</a> : null}
              </div>
              <p className="wizard-success-disclaimer">{tr("사진은 현재 탭에서만 유지됩니다. 창을 닫거나 새로고침하면 다시 선택해야 합니다. 공개하기 전에는 사진이 게시되지 않습니다.","Unsaved photos remain only in this tab. Reloading requires selecting them again.")}</p>
            </div>
          ) : (
          <div className="wizard-content" key={stage}>
            <div className="wizard-stage-header">
              <span className="eyebrow">{stageInfo.kicker}</span>
              <h2 id="wizard-stage-heading" tabIndex={-1}>{stageInfo.title}</h2>
              <p>{stageInfo.desc}</p>
            </div>

            {stage === 0 ? (
              <div className="wizard-start">
                <div className="wizard-ai-intro">
                  <span className="wizard-ai-sigil">✦</span>
                  <div><strong>{tr("등기 PDF가 있다면, AI로 더 빠르게","Start from a registry PDF")}</strong>
                    <p>{tr("주소와 전유면적을 추출해 초안을 채워드려요. 반드시 직접 확인한 뒤 반영합니다.","Extract editable address and area candidates. Always review them.")}</p></div>
                </div>
                <RegistryImport onApply={(draft) => {
                  setForm((previous) => ({
                    ...previous,
                    title: previous.title || draft.title,
                    address: previous.address || draft.address,
                    area: previous.area || draft.area,
                  }));
                  navigate(1);
                }} />
                <div className="wizard-divider"><span>{tr("또는","OR")}</span></div>
                <button type="button" className="wizard-manual-cta" onClick={() => navigate(1)}>
                  <span className="wizard-manual-icon" aria-hidden="true">⌨</span>
                  <span><strong>{tr("직접 입력해서 시작할게요","Start from scratch")}</strong><small>{tr("PDF 없이도 모든 항목을 편하게 작성할 수 있어요.","Complete the listing without a PDF.")}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            ) : null}

            {stage === 1 ? (
              <div className="wizard-fields-grid">
                <FormField id="title" title={tr("매물 제목 *","Title *")} value={form.title}
                  placeholder={tr("예: 신림역 도보 5분 원룸","E.g. Sunny apartment near station")} className="is-wide" onChange={(v) => set("title", v)}
                  hint={tr("짧고 구체적으로 작성하면 좋아요.", "Keep it short and specific.")} />
                <FormField id="address" title={tr("집 주소 *","Address *")} value={form.address}
                  placeholder={tr("예: 서울 관악구 신림로 100 (가상)","E.g. Fictional Seoul address")} className="is-wide" onChange={(v) => set("address", v)}
                  hint={tr("시연용 가상 주소를 사용해 주세요.", "Use a fictional address for this demo. Source addresses remain in their original language.")} />
                <FormField id="area" title={tr("전용 면적 *","Area *")} value={form.area}
                  placeholder={tr("예: 23","E.g. 23")} onChange={(v) => set("area", v)} inputMode="decimal"
                  hint={tr("㎡ 단위 · PDF를 분석했다면 자동으로 입력됩니다.","Square meters (㎡); PDF can prefill.")} />
                <div className="wizard-field-note"><span aria-hidden="true">✓</span><p>{tr("AI가 채운 내용도 등록 전 직접 확인하세요. 정보가 정확할수록 문의가 명확해집니다.","Check AI-prefilled details before saving.")}</p></div>
              </div>
            ) : null}

            {stage === 2 ? (
              <div className="wizard-deal">
                <fieldset className="wizard-trade-group">
                  <legend>{tr("거래 유형", "Transaction type")} {editId ? tr("(수정 불가)", "(cannot be changed)") : ""}</legend>
                  <div className="wizard-trade-cards">
                    {([
                      { name: "월세", desc: "보증금 + 월 임대료", sign: "₩" },
                      { name: "전세", desc: "보증금 중심 계약", sign: "⌂" },
                      { name: "매매", desc: "주택 매도 가격", sign: "↗" },
                    ] as const).map((choice) => (
                      <button type="button" key={choice.name}
                        className={"wizard-trade-card " + (form.tradeType === choice.name ? "is-selected" : "")}
                        disabled={!!editId} aria-pressed={form.tradeType === choice.name}
                        onClick={() => set("tradeType", choice.name as TradeType)}>
                        <span className="wizard-trade-icon">{choice.sign}</span>
                        <strong>{tr(choice.name,choice.name==="월세"?"Monthly rent":choice.name==="전세"?"Jeonse":"Sale")}</strong>
                        <small>{tr(choice.desc,choice.name==="월세"?"Deposit + rent":choice.name==="전세"?"Lump-sum deposit":"Purchase price")}</small>
                        <span className="wizard-radio-indicator" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="wizard-fields-grid">
                  {form.tradeType !== "매매" ? <FormField id="deposit" title={tr("보증금 *","Deposit *")} value={form.deposit}
                    placeholder={tr("예: 1000","E.g. 1000")} hint={tr("단위: 만원","In ₩10,000")} onChange={(v) => set("deposit", v)} inputMode="numeric" /> : null}
                  {form.tradeType === "월세" ? <FormField id="rent" title={tr("월세 *","Monthly rent *")} value={form.rent}
                    placeholder={tr("예: 65","E.g. 65")} hint={tr("단위: 만원 / 월","₩10,000 per month")} onChange={(v) => set("rent", v)} inputMode="numeric" /> : null}
                  {form.tradeType === "매매" ? <FormField id="salePrice" title={tr("매매가 *","Sale price *")} value={form.salePrice}
                    placeholder={tr("예: 85000","E.g. 85000")} hint={tr("단위: 만원","In ₩10,000")} onChange={(v) => set("salePrice", v)} inputMode="numeric" /> : null}
                </div>
                <div className="wizard-tip"><span aria-hidden="true">ⓘ</span> {tr("가격은 문서에서 자동 추출하지 않습니다. 희망 거래 조건을 직접 입력해 주세요.", "Prices are not extracted from the document. Enter your proposed terms yourself.")}</div>
              </div>
            ) : null}

            {stage === 3 ? (
              <div className="wizard-details">
                <div className="wizard-fields-grid">
                  <FormField id="moveIn" title={tr("입주 가능일 *","Available date *")} value={form.moveIn}
                    placeholder={tr("예: 2026-11-10 또는 즉시 입주","E.g. 2026-12-01, flexible")} onChange={(v) => set("moveIn", v)}
                    hint={tr("정해진 날짜가 없다면 '협의 가능'이라고 적어도 됩니다.","Write flexible if negotiable.")} />
                  <FormField id="fee" title={tr("관리비","Monthly maintenance fee")} value={form.fee}
                    placeholder={tr("예: 8","E.g. 8")} onChange={(v) => set("fee", v)} inputMode="decimal"
                    hint={tr("단위: 만원 / 월 · 없다면 비워두세요.","₩10,000 per month; leave blank if none.")} />
                </div>
                <div className="wizard-features">
                  <div className="wizard-mini-heading"><strong>{tr("이 집만의 옵션","Home amenities")}</strong><span>{tr("복수 선택 가능","Select multiple")}</span></div>
                  <p>{tr("설치된 가전이나 주거 특성을 선택하세요.","Select included appliances and home features.")}</p>
                  <div className="feature-picker-chips">
                    {FEATURE_SUGGESTIONS[form.tradeType].map((option) => (
                      <button type="button" key={option}
                        aria-pressed={selectedOptions.includes(option)}
                        className={selectedOptions.includes(option) ? "feature-chip is-selected" : "feature-chip"}
                        onClick={() => toggleOption(option)}>
                        {selectedOptions.includes(option) ? "✓ " : "+ "}{listingFeatureLabel(option, en)}
                      </button>
                    ))}
                  </div>
                  <div className="field wizard-field wizard-options-raw">
                    <label htmlFor="options">{tr("그 밖의 옵션","Other amenities")}</label>
                    <input id="options" value={featureInputDisplay(form.options, en)} placeholder={tr("예: 에어컨, 냉장고, 반려동물 가능","E.g. air conditioner, refrigerator")}
                      onChange={(e) => set("options", featureInputCanonical(e.target.value, en))} />
                    <span className="hint">{tr("쉼표로 구분해 자유롭게 추가할 수 있습니다.","Separate multiple amenities with commas.")}</span>
                  </div>
                </div>
                <div className="wizard-fields-grid">
                  <div className="field wizard-field is-wide">
                    <label htmlFor="description">{tr("집 소개 (선택)","Home description (optional)")}</label>
                    <textarea id="description" rows={4} value={form.description}
                      placeholder={tr("예: 남향이라 밝고, 대중교통 이용이 편리해요.","E.g. Bright, close to transit.")}
                      onChange={(e) => set("description", e.target.value)} />
                  </div>
                  <FormField id="publisher" title={tr("게시자명 *","Display name *")} value={form.publisher}
                    placeholder={tr("예: 홍길동","E.g. Demo owner")} className="is-wide" onChange={(v) => set("publisher", v)}
                    hint={tr("실제 신원 인증이 아닌 시연용 표시 이름입니다.","Demo display name only; not identity verification.")} />
                </div>
              </div>
            ) : null}

            {stage === 4 ? (
              <div className="wizard-review">
                <div className="wizard-review-section">
                  <div><span>01</span><h3>{tr("공간 정보","Property details")}</h3></div>
                  <button type="button" onClick={() => navigate(1)}>{tr("수정 ↗", "Edit ↗")}</button>
                  <dl>
                    <div><dt>{tr("매물명","Title")}</dt><dd><span data-source-text={sourceText(form.title) ? "original" : undefined}>{displayValue(form.title)}</span>{sourceText(form.title) ? <small style={{display:"block",marginTop:4}}>{tr("원문 표기", "Original-language property name")}</small> : null}</dd></div>
                    <div><dt>{tr("주소","Address")}</dt><dd><span data-source-text={sourceText(form.address) ? "original" : undefined}>{displayValue(form.address)}</span>{sourceText(form.address) ? <small style={{display:"block",marginTop:4}}>{tr("원문 주소", "Address in the original language")}</small> : null}</dd></div>
                    <div><dt>{tr("전용 면적","Floor area")}</dt><dd>{form.area ? form.area + "㎡" : "—"}</dd></div>
                  </dl>
                </div>
                <div className="wizard-review-section">
                  <div><span>02</span><h3>{tr("거래 조건","Deal terms")}</h3></div>
                  <button type="button" onClick={() => navigate(2)}>{tr("수정 ↗", "Edit ↗")}</button>
                  <dl><div><dt>{tr("거래유형","Trade type")}</dt><dd>{tradeTypeLabel(form.tradeType, en)}</dd></div>
                    <div><dt>{tr("희망 가격","Asking price")}</dt><dd>{en ? englishListingPrice(form) : listingPriceLabel(form)}</dd></div></dl>
                </div>
                <div className="wizard-review-section">
                  <div><span>03</span><h3>{tr("생활 정보","Living details")}</h3></div>
                  <button type="button" onClick={() => navigate(3)}>{tr("수정 ↗", "Edit ↗")}</button>
                  <dl>
                    <div><dt>{tr("입주 가능일","Move-in availability")}</dt><dd>{displayValue(form.moveIn)}</dd></div>
                    <div><dt>{tr("관리비","Monthly fee")}</dt><dd>{form.fee ? (en ? wonFromManwon(form.fee) + " per month" : Number(form.fee).toLocaleString("ko-KR") + "만원") : tr("미입력", "Not entered")}</dd></div>
                    <div><dt>{tr("선택 옵션","Amenities")}</dt><dd>{selectedOptions.length ? selectedOptions.map(value => listingFeatureLabel(value, en)).join(", ") : tr("없음", "None")}</dd></div>
                    <div><dt>{tr("게시자명","Display name")}</dt><dd>{displayValue(form.publisher)}</dd></div>
                    {form.description ? <div><dt>{tr("소개","Description")}</dt><dd>{form.description}</dd></div> : null}
                  </dl>
                </div>
                <div className="wizard-final-disclosure">
                  <strong>{tr("등록 전 확인","Before you save")}</strong>
                  <p>{tr("모든 신규 등록 매물은 시연용 합성 데이터로 취급됩니다. AI 분석 내용은 소유권 확인이나 법률적 판단이 아닙니다.","Listings are demonstration data. AI suggestions do not verify ownership or legal rights.")}</p>
                </div>
              </div>
            ) : null}
          </div>
          )}
          {/* The SAME photo editor stays mounted across save. Uploaded blobs stay local
              in this tab; only explicit owner publication writes a JPEG derivative. */}
          {maxVisited >= 3 ? (
            <div id={saved ? "after-register-photos" : undefined}
              className={saved ? "wizard-post-register-photos" : "wizard-stage-photo-panel"}
              hidden={!saved && stage !== 3}>
              {saved ? <div className="wizard-photo-followup-label">
                <span className="eyebrow">FINISH YOUR LISTING</span>
                <h2>{tr("내 집 사진을 마지막으로 확인해 주세요","Review your property photos")}</h2>
                <p>{tr("AI 분석은 선택 사항이에요. 사진을 직접 확인하고 별도로 동의한 경우에만 실제 매물에 공개됩니다.","AI analysis is optional. Only explicitly approved photos become public.")}</p>
              </div> : null}
              <ListingPhotoGuide listingId={saved ? doneId || undefined : undefined}
                onSuggestOptions={async (values) => {
                  const existing = form.options.split(",").map((x) => x.trim()).filter(Boolean);
                  const merged = Array.from(new Set([...existing, ...values]));
                  if (saved && doneId) {
                    const token = process.env.NEXT_PUBLIC_WRITE_TOKEN;
                    const res = await fetch("/api/listings/" + encodeURIComponent(doneId), {
                      method: "PATCH",
                      headers: {"Content-Type":"application/json",
                        ...(token ? {"x-write-token":token} : {}), ...authHeaders()},
                      body: JSON.stringify({options:merged}),
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({})) as {error?:string};
                      throw new Error(body.error ?? "옵션 저장에 실패했어요.");
                    }
                  }
                  set("options", merged.join(", "));
                }} />
            </div>
          ) : null}

          {!saved ? (
          <>
          {error ? <p className="wizard-error" role="alert">{ui(error)}</p> : null}
          <div className="wizard-action-bar">
            <button type="button" className="wizard-action-back"
              onClick={() => navigate((stage - 1) as RegisterStep)}
              disabled={stage === (editId ? 1 : 0) || saving}>{tr("← 이전","← Back")}</button>
            <span className="wizard-action-caption">{stage === 4 ? tr("확인 후 최종 등록","Review before saving") : tr("언제든 이전 단계로 돌아갈 수 있어요","You can go back anytime")}</span>
            <button type="button" className="btn wizard-action-next"
              disabled={saving} onClick={stage === 4 ? submit : nextStage}>
              {saving ? tr("저장하는 중...","Saving...") : stage === 4 ? (editId ? tr("변경사항 저장하기","Save changes") : tr("매물 등록하기","Save listing")) : tr("다음 단계","Continue")}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          </>
          ) : null}
        </section>

        {!saved ? <aside className="wizard-aside" aria-label={tr("실시간 매물 미리보기","Live listing preview")}>
          <div className="wizard-preview">
            <div className="wizard-preview-top"><span>LIVE PREVIEW</span><span className="wizard-preview-live"><i /> {tr("미리보기", "Preview")}</span></div>
            <div className="wizard-preview-illustration" aria-hidden="true">
              <span className="wizard-building building-back" />
              <span className="wizard-building building-front" />
              <span className="wizard-preview-sun" />
            </div>
            <span className="wizard-preview-type">{tradeTypeLabel(form.tradeType, en)}</span>
            <h3 data-source-text={sourceText(form.title) ? "original" : undefined}>{labelValue(form.title, tr("어떤 공간을 소개할까요?", "Which home will you introduce?"))}</h3>
            <p className="wizard-preview-address" data-source-text={sourceText(form.address) ? "original" : undefined}>{labelValue(form.address, tr("주소를 입력하면 여기에 표시돼요.", "Your address will appear here."))}</p>
            {sourceText(form.title) || sourceText(form.address) ? <small style={{display:"block",marginTop:4}}>{tr("원문 표기", "Original-language name / address")}</small> : null}
            <p className="wizard-preview-price">{en ? englishListingPrice(form) : listingPriceLabel(form)}</p>
            <div className="wizard-preview-details">
              <div><small>{tr("전용면적","Floor area")}</small><strong>{form.area ? form.area + "㎡" : "—"}</strong></div>
              <div><small>{tr("입주 시기","Available")}</small><strong>{labelValue(form.moveIn, "—")}</strong></div>
            </div>
            <div className="wizard-preview-footer">
              <div className="wizard-preview-progress"><span style={{ width: (filled / 5 * 100) + "%" }} /></div>
              <small>{en ? `${filled}/5 essential details entered` : `기본 정보 ${filled}/5개 입력됨`}</small>
            </div>
          </div>
          <div className="wizard-assurance"><span aria-hidden="true">✧</span>
            <div><strong>{tr("한 번에 다 쓰지 않아도 괜찮아요.","You can finish this over multiple steps.")}</strong>
              <p>{tr("입력 내용은 현재 브라우저 탭에 임시 보관됩니다. PDF 원본은 저장하지 않아요.","This tab keeps a draft. Original registry PDFs are not stored.")}</p></div>
          </div>
        </aside> : null}
      </div>
      {!saved ? <p className="wizard-legal-note">{tr("DirectHome은 합성 매물 기반 AI 거래 시연 서비스입니다. 실제 부동산 광고·중개 또는 소유권 검증 서비스가 아닙니다.", "DirectHome demonstrates AI-assisted transactions using synthetic listings. It is not a real property advertising, brokerage or ownership verification service.")}</p> : null}
    </div>
  );
}
