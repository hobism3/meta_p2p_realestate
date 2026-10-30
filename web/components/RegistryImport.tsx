"use client";

import { useState, type ChangeEvent } from "react";
import { authHeaders } from "../lib/client-auth";
import type { RegistryDraft } from "../lib/registry-draft";

interface DraftResponse {
  provider?: "meta" | "mock";
  model?: string;
  draft?: RegistryDraft;
  error?: string;
}

function chooseTitle(d: RegistryDraft): string {
  const pieces = [d.buildingType.value, d.floor.value ? `${d.floor.value}층` : "", d.unit.value ? `${d.unit.value}호` : ""].filter(Boolean);
  return pieces.length ? `${pieces.join(" ")} 매물 (확인 필요)` : "";
}

export default function RegistryImport({ onApply }: { onApply: (suggestion: { title: string; address: string; area: string }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [applied, setApplied] = useState(false);

  const onFile = (ev: ChangeEvent<HTMLInputElement>) => {
    const next = ev.target.files?.[0] ?? null;
    setFile(next);
    setError("");
    setResult(null);
    setApplied(false);
  };

  const analyze = async () => {
    if (busy) return;
    if (!file || !/\.pdf$/i.test(file.name) || file.size > 2 * 1024 * 1024 || file.size < 180) {
      setError("2MB 이하의 PDF 문서를 선택해 주세요.");
      return;
    }
    if (!consent) {
      setError("개인정보 가림 처리 및 분석 전송 동의를 확인해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
      const res = await fetch("/api/listings/import-registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.NEXT_PUBLIC_WRITE_TOKEN ? { "x-write-token": process.env.NEXT_PUBLIC_WRITE_TOKEN } : {}),
          ...authHeaders(),
        },
        body: JSON.stringify({ filename: file.name, pdf_base64: btoa(binary), consent }),
      });
      const body = await res.json() as DraftResponse;
      if (!res.ok || !body.draft) throw new Error(body.error ?? "문서 분석에 실패했습니다.");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "문서 분석에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const draft = result?.draft;
  const entries: Array<{ title: string; field: { value: string; evidence: string } }> = draft ? [
    { title: "주소", field: draft.address },
    { title: "전유부분 면적", field: draft.exclusiveAreaSqm },
    { title: "건물 유형", field: draft.buildingType },
    { title: "층", field: draft.floor },
    { title: "호수", field: draft.unit },
  ] : [];
  const canApply = !!draft && draft.documentKind === "registry" && !!(draft.address.value || draft.exclusiveAreaSqm.value || draft.buildingType.value);
  return (
    <section className="registry-import" aria-label="AI 문서 기반 매물 등록">
      <div className="registry-import-head">
        <span className="registry-spark" aria-hidden="true">✦</span>
        <div>
          <span className="eyebrow">META AI · DOCUMENT TO DRAFT</span>
          <h2>등기 문서로 등록 초안 만들기</h2>
          <p>주소·전유면적을 일일이 입력하지 마세요. PDF에서 확인 가능한 항목만 초안으로 가져옵니다.</p>
        </div>
      </div>
      <p className="registry-warning">
        <strong>시연 전용 · 진위 확인 아님.</strong> 등기부에는 개인정보와 권리관계가 포함될 수 있습니다.
        성명·주민등록번호·소유자 정보 등을 가린 문서만 사용하세요. 실제 개인정보가 있는 서류는 업로드하지 마세요.
      </p>
      <div className="registry-actions">
        <label htmlFor="registry-pdf" className="registry-file-label">PDF 파일 선택</label>
        <input id="registry-pdf" type="file" accept=".pdf,application/pdf" onChange={onFile} disabled={busy} />
        <a className="btn ghost registry-example-link" href="/api/listings/import-registry/sample" download>가상 PDF 예시 내려받기 ↗</a>
      </div>
      <p className="meta">{file ? `선택된 파일: ${file.name}` : "예시 PDF로 먼저 체험할 수 있습니다."} · 최대 2MB</p>
      <label className="registry-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
        <span>민감정보를 가린 시연 문서이며, Meta 모드에서는 분석을 위해 PDF가 Meta Model API로 1회 전송됨을 이해하고 동의합니다. 분석 결과는 사람이 확인합니다.</span>
      </label>
      <button className="btn" onClick={analyze} disabled={busy || !file || !consent}>{busy ? "Meta AI 문서 분석 중..." : "AI로 매물 정보 추출하기"}</button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {draft ? <div className="registry-review">
        <div className="registry-review-head"><h3>추출 결과 미리보기</h3><span className="pill">{result?.provider === "meta" ? "Meta Muse Spark" : "가상 샘플 Mock"}</span></div>
        <p className="meta">모델이 제시한 문서 발췌를 PDF 원본과 대조해 주세요. 추출값은 검증된 등기 사실이나 소유권 증명이 아닙니다.</p>
        <dl className="registry-fields">
          {entries.map(({ title, field }) => (
            <div key={title} className="registry-field">
              <dt>{title}</dt>
              <dd><strong>{field.value || "확인 필요"}</strong>{field.evidence ? <small>모델이 제시한 근거: {field.evidence}</small> : null}</dd>
            </div>
          ))}
        </dl>
        {draft.cautions.map((warning) => <p className="registry-caution" key={warning}>{warning}</p>)}
        <button type="button" className="btn" disabled={!canApply || applied} onClick={() => {
          if (!draft) return;
          onApply({ title: chooseTitle(draft), address: draft.address.value, area: draft.exclusiveAreaSqm.value });
          setApplied(true);
        }}>{applied ? "초안이 입력됐습니다" : "비어 있는 등록 항목에 반영하기"}</button>
        <p className="meta">적용해도 매물은 게시되지 않습니다. 거래가격·관리비·입주일·옵션을 추가하고 최종 등록 버튼을 눌러야 합니다.</p>
      </div> : null}
    </section>
  );
}
