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

const STORAGE_KEY = "directhome.register.wizard.v1";
const NUMBER_FIELDS = new Set<keyof RegisterDraft>(["deposit", "rent", "salePrice", "fee", "area"]);
const STAGE_CONTENT = [
  { kicker: "READY TO LIST", title: "내 공간을 소개하는 가장 쉬운 시작", desc: "등기 문서가 있다면 AI가 주소와 면적을 정리해 드려요. 없어도 괜찮습니다." },
  { kicker: "01 · THE SPACE", title: "어떤 공간인가요?", desc: "사람들이 매물을 알아볼 수 있도록 기본 정보를 알려주세요." },
  { kicker: "02 · THE DEAL", title: "어떤 조건으로 거래할까요?", desc: "거래 방식을 고르고, 필요한 금액만 입력하면 됩니다." },
  { kicker: "03 · THE DETAILS", title: "생활 정보를 조금 더 알려주세요.", desc: "입주 일정과 옵션을 추가하면 더 좋은 문의로 이어질 수 있어요." },
  { kicker: "04 · ONE LAST LOOK", title: "등록 전에 한 번만 확인해 주세요.", desc: "입력한 정보를 검토하세요. 마지막 버튼을 누르기 전에는 게시되지 않습니다." },
] as const;

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
    if (!window.confirm("이 탭에 임시 저장된 매물 정보를 모두 지울까요?")) return;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setForm({ ...EMPTY_REGISTER_DRAFT });
    setStage(0);
    setMaxVisited(0);
    setError("");
    document.getElementById("listing-wizard-content")?.scrollIntoView({ block: "start" });
  };

  if (loading || !hydrated) return <div className="wizard-loading card" role="status">매물 정보를 준비하고 있어요...</div>;
  if (editId && !isCustom) return <div className="card">시연용 기본 매물은 수정할 수 없습니다. <a href="/register">새 매물 등록하기</a></div>;

  const filled = [form.title, form.address, form.area, form.moveIn, form.publisher].filter((value) => value.trim()).length;
  const stageInfo = STAGE_CONTENT[stage];

  if (saved) return (
    <div className="wizard-success">
      <div className="wizard-success-mark" aria-hidden="true">✓</div>
      <span className="eyebrow">ALL SET</span>
      <h1>{editId ? "변경사항을 저장했어요." : "새 매물을 등록했어요."}</h1>
      <p>입력하신 내용을 확인하고 다음 단계를 진행할 수 있습니다.</p>
      <div className="wizard-success-actions">
        {doneId ? <a className="btn" href={"/listings/" + doneId}>상세 보기 ↗</a> : null}
        <a className="btn ghost" href="/">매물 둘러보기</a>
      </div>
    </div>
  );

  return (
    <div className="listing-wizard-page">
      <div className="wizard-hero">
        <div>
          <span className="wizard-hero-label"><span className="wizard-label-dot" /> DIRECTHOME STUDIO</span>
          <h1>{editId ? "우리 집 정보를 더 정확하게." : <>집을 소개하는 일이<br /><em>더 쉬워지도록.</em></>}</h1>
          <p>필요한 정보만 하나씩. 복잡한 등록을 간결한 과정으로 바꿨어요.</p>
        </div>
        <div className="wizard-hero-actions">
          <a href="/" className="wizard-back-link">← 매물 둘러보기</a>
          {!editId ? <button type="button" className="wizard-clear" onClick={resetDraft}>입력 내용 초기화</button> : null}
        </div>
      </div>

      <nav className="wizard-steps" aria-label="매물 등록 진행 단계">
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
              <span className="wizard-step-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="wizard-layout">
        <section id="listing-wizard-content" className="wizard-main" aria-labelledby="wizard-stage-heading">
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
                  <div><strong>등기 PDF가 있다면, AI로 더 빠르게</strong>
                    <p>주소와 전유면적을 추출해 초안을 채워드려요. 반드시 직접 확인한 뒤 반영합니다.</p></div>
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
                <div className="wizard-divider"><span>또는</span></div>
                <button type="button" className="wizard-manual-cta" onClick={() => navigate(1)}>
                  <span className="wizard-manual-icon" aria-hidden="true">⌨</span>
                  <span><strong>직접 입력해서 시작할게요</strong><small>PDF 없이도 모든 항목을 편하게 작성할 수 있어요.</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            ) : null}

            {stage === 1 ? (
              <div className="wizard-fields-grid">
                <FormField id="title" title="매물 제목 *" value={form.title}
                  placeholder="예: 신림역 도보 5분 원룸" className="is-wide" onChange={(v) => set("title", v)}
                  hint="짧고 구체적으로 작성하면 좋아요." />
                <FormField id="address" title="집 주소 *" value={form.address}
                  placeholder="예: 서울 관악구 신림로 100 (가상)" className="is-wide" onChange={(v) => set("address", v)}
                  hint="시연용 가상 주소를 사용해 주세요." />
                <FormField id="area" title="전용 면적 *" value={form.area}
                  placeholder="예: 23" onChange={(v) => set("area", v)} inputMode="decimal"
                  hint="㎡ 단위 · PDF를 분석했다면 자동으로 입력됩니다." />
                <div className="wizard-field-note"><span aria-hidden="true">✓</span><p>AI가 채운 내용도 등록 전 직접 확인하세요. 정보가 정확할수록 문의가 명확해집니다.</p></div>
              </div>
            ) : null}

            {stage === 2 ? (
              <div className="wizard-deal">
                <fieldset className="wizard-trade-group">
                  <legend>거래 유형 {editId ? "(수정 불가)" : ""}</legend>
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
                        <strong>{choice.name}</strong>
                        <small>{choice.desc}</small>
                        <span className="wizard-radio-indicator" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="wizard-fields-grid">
                  {form.tradeType !== "매매" ? <FormField id="deposit" title="보증금 *" value={form.deposit}
                    placeholder="예: 1000" hint="단위: 만원" onChange={(v) => set("deposit", v)} inputMode="numeric" /> : null}
                  {form.tradeType === "월세" ? <FormField id="rent" title="월세 *" value={form.rent}
                    placeholder="예: 65" hint="단위: 만원 / 월" onChange={(v) => set("rent", v)} inputMode="numeric" /> : null}
                  {form.tradeType === "매매" ? <FormField id="salePrice" title="매매가 *" value={form.salePrice}
                    placeholder="예: 85000" hint="단위: 만원" onChange={(v) => set("salePrice", v)} inputMode="numeric" /> : null}
                </div>
                <div className="wizard-tip"><span aria-hidden="true">ⓘ</span> 가격은 문서에서 자동 추출하지 않습니다. 희망 거래 조건을 직접 입력해 주세요.</div>
              </div>
            ) : null}

            {stage === 3 ? (
              <div className="wizard-details">
                <div className="wizard-fields-grid">
                  <FormField id="moveIn" title="입주 가능일 *" value={form.moveIn}
                    placeholder="예: 2026-11-10 또는 즉시 입주" onChange={(v) => set("moveIn", v)}
                    hint="정해진 날짜가 없다면 '협의 가능'이라고 적어도 됩니다." />
                  <FormField id="fee" title="관리비" value={form.fee}
                    placeholder="예: 8" onChange={(v) => set("fee", v)} inputMode="decimal"
                    hint="단위: 만원 / 월 · 없다면 비워두세요." />
                </div>
                <div className="wizard-features">
                  <div className="wizard-mini-heading"><strong>이 집만의 옵션</strong><span>복수 선택 가능</span></div>
                  <p>설치된 가전이나 주거 특성을 선택하세요.</p>
                  <div className="feature-picker-chips">
                    {FEATURE_SUGGESTIONS[form.tradeType].map((option) => (
                      <button type="button" key={option}
                        aria-pressed={selectedOptions.includes(option)}
                        className={selectedOptions.includes(option) ? "feature-chip is-selected" : "feature-chip"}
                        onClick={() => toggleOption(option)}>
                        {selectedOptions.includes(option) ? "✓ " : "+ "}{option}
                      </button>
                    ))}
                  </div>
                  <div className="field wizard-field wizard-options-raw">
                    <label htmlFor="options">그 밖의 옵션</label>
                    <input id="options" value={form.options} placeholder="예: 에어컨, 냉장고, 반려동물 가능"
                      onChange={(e) => set("options", e.target.value)} />
                    <span className="hint">쉼표로 구분해 자유롭게 추가할 수 있습니다.</span>
                  </div>
                </div>
                <div className="wizard-fields-grid">
                  <div className="field wizard-field is-wide">
                    <label htmlFor="description">집 소개 (선택)</label>
                    <textarea id="description" rows={4} value={form.description}
                      placeholder="예: 남향이라 밝고, 대중교통 이용이 편리해요."
                      onChange={(e) => set("description", e.target.value)} />
                  </div>
                  <FormField id="publisher" title="게시자명 *" value={form.publisher}
                    placeholder="예: 홍길동" className="is-wide" onChange={(v) => set("publisher", v)}
                    hint="실제 신원 인증이 아닌 시연용 표시 이름입니다." />
                </div>
              </div>
            ) : null}

            {stage === 4 ? (
              <div className="wizard-review">
                <div className="wizard-review-section">
                  <div><span>01</span><h3>공간 정보</h3></div>
                  <button type="button" onClick={() => navigate(1)}>수정 ↗</button>
                  <dl>
                    <div><dt>매물명</dt><dd>{labelValue(form.title)}</dd></div>
                    <div><dt>주소</dt><dd>{labelValue(form.address)}</dd></div>
                    <div><dt>전용 면적</dt><dd>{form.area ? form.area + "㎡" : "—"}</dd></div>
                  </dl>
                </div>
                <div className="wizard-review-section">
                  <div><span>02</span><h3>거래 조건</h3></div>
                  <button type="button" onClick={() => navigate(2)}>수정 ↗</button>
                  <dl><div><dt>거래유형</dt><dd>{form.tradeType}</dd></div>
                    <div><dt>희망 가격</dt><dd>{listingPriceLabel(form)}</dd></div></dl>
                </div>
                <div className="wizard-review-section">
                  <div><span>03</span><h3>생활 정보</h3></div>
                  <button type="button" onClick={() => navigate(3)}>수정 ↗</button>
                  <dl>
                    <div><dt>입주 가능일</dt><dd>{labelValue(form.moveIn)}</dd></div>
                    <div><dt>관리비</dt><dd>{form.fee ? Number(form.fee).toLocaleString("ko-KR") + "만원" : "미입력"}</dd></div>
                    <div><dt>선택 옵션</dt><dd>{selectedOptions.length ? selectedOptions.join(", ") : "없음"}</dd></div>
                    <div><dt>게시자명</dt><dd>{labelValue(form.publisher)}</dd></div>
                    {form.description ? <div><dt>소개</dt><dd>{form.description}</dd></div> : null}
                  </dl>
                </div>
                <div className="wizard-final-disclosure">
                  <strong>등록 전 확인</strong>
                  <p>모든 신규 등록 매물은 시연용 합성 데이터로 취급됩니다. AI 분석 내용은 소유권 확인이나 법률적 판단이 아닙니다.</p>
                </div>
              </div>
            ) : null}
          </div>

          {error ? <p className="wizard-error" role="alert">{error}</p> : null}
          <div className="wizard-action-bar">
            <button type="button" className="wizard-action-back"
              onClick={() => navigate((stage - 1) as RegisterStep)}
              disabled={stage === (editId ? 1 : 0) || saving}>← 이전</button>
            <span className="wizard-action-caption">{stage === 4 ? "확인 후 최종 등록" : "언제든 이전 단계로 돌아갈 수 있어요"}</span>
            <button type="button" className="btn wizard-action-next"
              disabled={saving} onClick={stage === 4 ? submit : nextStage}>
              {saving ? "저장하는 중..." : stage === 4 ? (editId ? "변경사항 저장하기" : "매물 등록하기") : "다음 단계"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <aside className="wizard-aside" aria-label="실시간 매물 미리보기">
          <div className="wizard-preview">
            <div className="wizard-preview-top"><span>LIVE PREVIEW</span><span className="wizard-preview-live"><i /> 미리보기</span></div>
            <div className="wizard-preview-illustration" aria-hidden="true">
              <span className="wizard-building building-back" />
              <span className="wizard-building building-front" />
              <span className="wizard-preview-sun" />
            </div>
            <span className="wizard-preview-type">{form.tradeType}</span>
            <h3>{labelValue(form.title, "어떤 공간을 소개할까요?")}</h3>
            <p className="wizard-preview-address">{labelValue(form.address, "주소를 입력하면 여기에 표시돼요.")}</p>
            <p className="wizard-preview-price">{listingPriceLabel(form)}</p>
            <div className="wizard-preview-details">
              <div><small>전용면적</small><strong>{form.area ? form.area + "㎡" : "—"}</strong></div>
              <div><small>입주 시기</small><strong>{labelValue(form.moveIn, "—")}</strong></div>
            </div>
            <div className="wizard-preview-footer">
              <div className="wizard-preview-progress"><span style={{ width: (filled / 5 * 100) + "%" }} /></div>
              <small>기본 정보 {filled}/5개 입력됨</small>
            </div>
          </div>
          <div className="wizard-assurance"><span aria-hidden="true">✧</span>
            <div><strong>한 번에 다 쓰지 않아도 괜찮아요.</strong>
              <p>입력 내용은 현재 브라우저 탭에 임시 보관됩니다. PDF 원본은 저장하지 않아요.</p></div>
          </div>
        </aside>
      </div>
      <p className="wizard-legal-note">DirectHome은 합성 매물 기반 AI 거래 시연 서비스입니다. 실제 부동산 광고·중개 또는 소유권 검증 서비스가 아닙니다.</p>
    </div>
  );
}
