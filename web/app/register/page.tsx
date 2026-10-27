"use client";

import { useEffect, useState } from "react";
import type { Listing, TradeType } from "../../lib/listings";

const EMPTY = {
  title: "", address: "", tradeType: "월세" as TradeType,
  deposit: "", rent: "", fee: "", area: "", moveIn: "",
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
          deposit: String(l.deposit), rent: String(l.rent), fee: String(l.fee),
          area: String(l.area), moveIn: l.moveIn,
          options: l.options.join(", "), description: l.description, publisher: l.publisher,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "조회 실패"))
      .finally(() => setLoading(false));
  }, [editId]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.address.trim() || !form.moveIn.trim() || !form.publisher.trim()) {
      setError("필수 항목 누락"); return;
    }
    if (form.tradeType === "월세" && !form.rent.trim()) { setError("필수 항목 누락: 월세"); return; }
    const payload = {
      title: form.title.trim(), address: form.address.trim(), tradeType: form.tradeType,
      deposit: Number(form.deposit || 0), rent: Number(form.rent || 0),
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
        },
        body: JSON.stringify(editId ? {
          title: payload.title, description: payload.description, moveIn: payload.moveIn,
          deposit: payload.deposit, rent: payload.rent, fee: payload.fee, area: payload.area,
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
      <section className="card">
        <h2>{editId ? "매물 수정" : "매물 등록"}</h2>
        <p className="meta">서버에 저장됩니다(시연용). 합성 데이터로 취급됩니다.</p>
        {[
          ["title", "제목 *", "예: 신림역 도보 5분 원룸"],
          ["address", "주소 *", "예: 서울 관악구 신림로 100 (가상)"],
          ["deposit", "보증금(만원) *", "예: 1000"],
          ["rent", "월세(만원, 월세만) *", "예: 65"],
          ["fee", "관리비(만원)", "예: 8"],
          ["area", "면적(㎡) *", "예: 23"],
          ["moveIn", "입주 가능일 *", "예: 2026-11-10 또는 즉시 입주"],
          ["options", "옵션(쉼표 구분)", "예: 에어컨, 냉장고"],
          ["description", "설명", "예: 남향이라 밝습니다"],
          ["publisher", "게시자명 *", "예: 홍길동"],
        ].map(([k, label, ph]) => (
          <div className="field" key={k}>
            <label>{label}</label>
            <input value={(form as any)[k]} placeholder={ph} onChange={(e) => set(k as any, e.target.value)} />
          </div>
        ))}
        <div className="field">
          <label>거래유형</label>
          <select value={form.tradeType} onChange={(e) => set("tradeType", e.target.value)} disabled={!!editId}>
            <option value="월세">월세</option>
            <option value="전세">전세</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" onClick={submit}>{editId ? "수정 저장" : "등록하기"}</button>
        {doneId && <p>저장됐습니다. <a href={`/listings/${doneId}`}>상세 보기</a></p>}
      </section>
    </div>
  );
}
