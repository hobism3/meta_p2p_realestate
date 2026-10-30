"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "../../lib/client-auth";
import type { Listing, TradeType } from "../../lib/listings";
import { FEATURE_SUGGESTIONS } from "../../lib/listing-presentation";

const EMPTY = {
  title: "", address: "", tradeType: "월세" as TradeType,
  deposit: "", rent: "", salePrice: "", fee: "", area: "", moveIn: "",
  options: "", description: "", publisher: "",
};

export default function RegisterPage({ searchParams }: { searchParams: { edit?: string } }) {
  const editId = searchParams.edit ?? "";
  const [form, setForm] = useState(EMPTY);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    fetch(`/api/listings/${editId}`)
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
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, [editId]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const selectedOptions = form.options.split(",").map(x => x.trim()).filter(Boolean);
  const toggleOption = (option: string) => {
    if (selectedOptions.includes(option)) { set("options", selectedOptions.filter(x => x !== option).join(", ")); return; }
    const excluded = option === "반려동물 가능" ? "반려동물 불가"
      : option === "반려동물 불가" ? "반려동물 가능"
      : option === "확장형" ? "비확장형"
      : option === "비확장형" ? "확장형" : "";
    set("options", [...selectedOptions.filter(x => x !== excluded), option].join(", "));
  };

  const submit = async () => {
    if (!form.title.trim() || !form.address.trim() || !form.moveIn.trim() || !form.publisher.trim()) {
      setError("필수 항목 누락"); return;
    }
    if (form.tradeType !== "매매" && !form.deposit.trim()) { setError("필수 항목 누락: 보증금"); return; }
    if (!form.area.trim()) { setError("필수 항목 누락: 면적"); return; }
    if (form.tradeType === "월세" && !form.rent.trim()) { setError("필수 항목 누락: 월세"); return; }
    if (form.tradeType === "매매" && !form.salePrice.trim()) { setError("필수 항목 누락: 매매가"); return; }
    const payload = {
      title: form.title.trim(), address: form.address.trim(), tradeType: form.tradeType,
      deposit: Number(form.deposit || 0), rent: Number(form.rent || 0),
      salePrice: Number(form.salePrice || 0),
      fee: Number(form.fee || 0), area: Number(form.area || 0),
      moveIn: form.moveIn.trim(),
      options: form.options.split(",").map((s) => s.trim()).filter(Boolean),
      description: form.description.trim(), publisher: form.publisher.trim(),
    };
    try {
      const token = process.env.NEXT_PUBLIC_WRITE_TOKEN;
      const res = await fetch(editId ? `/api/listings/${editId}` : "/api/listings", {
        method: editId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-write-token": token } : {}),
          ...authHeaders(),
        },
        body: JSON.stringify(editId ? {
          title: payload.title, description: payload.description, moveIn: payload.moveIn,
          deposit: payload.deposit, rent: payload.rent, salePrice: payload.salePrice,
          fee: payload.fee, area: payload.area,
          address: payload.address, publisher: payload.publisher, options: payload.options,
        } : payload),
      });
      const body = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) { setError(body.error ?? "저장 실패"); return; }
      setError("");
      setDoneId(editId || body.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  };

  if (loading) return <div className="card">불러오는 중...</div>;
  if (editId && !isCustom && !loading) {
    return <div className="card">시연용 기본 매물은 수정할 수 없습니다. 새로 등록해 주세요.</div>;
  }

  return (
    <div className="grid">
      <section className="card form-card">
        <span className="eyebrow">LIST YOUR SPACE</span>
        <h1>{editId ? "매물 정보 수정" : "새 매물 등록"}</h1>
        <p className="meta">거래유형에 맞게 정보를 입력해 주세요. 모든 신규 등록 매물은 시연용 합성 데이터로 취급됩니다.</p>
        <div className="field"><label htmlFor="trade-type">거래유형</label>
          <select id="trade-type" value={form.tradeType} onChange={(e) => set("tradeType", e.target.value)} disabled={!!editId}>
            <option value="월세">월세</option><option value="전세">전세</option><option value="매매">매매</option>
          </select>
        </div>
        <p className="meta">선택한 거래유형에 필요한 가격 항목만 표시됩니다.</p>
        {[
          ["title", "제목 *", "예: 신림역 도보 5분 원룸"],
          ["address", "주소 *", "예: 서울 관악구 신림로 100 (가상)"],
          ["deposit", "보증금(만원) *", "예: 1000"],
          ["rent", "월세(만원, 월세만) *", "예: 65"],
          ["salePrice", "매매가(만원, 매매만) *", "예: 85000"],
          ["fee", "관리비(만원)", "예: 8"],
          ["area", "면적(㎡) *", "예: 23"],
          ["moveIn", "입주 가능일 *", "예: 2026-11-10 또는 즉시 입주"],
          ["options", "옵션 및 주거 특성(쉼표 구분)", "예: 에어컨, 냉장고, 반려동물 가능"],
          ["description", "설명", "예: 남향이라 밝습니다"],
          ["publisher", "게시자명 *", "예: 홍길동"],
        ].filter(([k]) => !(
          (k === "deposit" && form.tradeType === "매매") ||
          (k === "rent" && form.tradeType !== "월세") ||
          (k === "salePrice" && form.tradeType !== "매매")
        )).map(([k, label, ph]) => (
          <div className="field" key={k}>
            <label htmlFor={k}>{label}</label>
            <input id={k} value={(form as any)[k]} placeholder={ph} onChange={(e) => set(k as any, e.target.value)} />
          </div>
        ))}
        <div className="feature-picker">
          <h2>{form.tradeType === "매매" ? "설비 · 공간 특성" : "가전 · 옵션 · 생활 조건"}</h2>
          <p className="meta">해당 매물에 실제로 제공되는 항목만 선택하세요. 반려동물 허용 여부는 가격이 아닌 생활 조건입니다.</p>
          <div className="feature-picker-chips">
            {FEATURE_SUGGESTIONS[form.tradeType].map((option) => (
              <button type="button" key={option} aria-pressed={selectedOptions.includes(option)} className={selectedOptions.includes(option) ? "feature-chip is-selected" : "feature-chip"} onClick={() => toggleOption(option)}>
                {selectedOptions.includes(option) ? "✓ " : "+ "}{option}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn form-submit" onClick={submit}>{editId ? "변경사항 저장하기" : "매물 등록하기"} ↗</button>
        {doneId && <p>저장됐습니다. <a href={`/listings/${doneId}`}>상세 보기</a></p>}
      </section>
    </div>
  );
}
