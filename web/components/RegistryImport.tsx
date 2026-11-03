"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { authHeaders } from "../lib/client-auth";
import type { RegistryDraft } from "../lib/registry-draft";
import { registryDraftTitle } from "../lib/registry-title";
import { useUiLocale } from "../lib/ui-locale";
import { registryImportMessage, registryFieldGloss } from "../lib/registry-import-copy";

interface DraftResponse {
  provider?: "meta" | "mock";
  model?: string;
  draft?: RegistryDraft;
  error?: string;
}

export default function RegistryImport({ onApply }: { onApply: (suggestion: { title: string; address: string; area: string }) => void }) {
  const { tr, en } = useUiLocale();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [applied, setApplied] = useState(false);
  const [capability, setCapability] = useState<{ provider: "meta" | "mock"; enabled: boolean; sampleOnly: boolean; acceptedHashes?: string[] } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/listings/import-registry", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((v) => { if (active && v && (v.provider === "meta" || v.provider === "mock")) setCapability(v); })
      .catch(() => { /* Display is advisory; POST also validates provider mode. */ });
    return () => { active = false; };
  }, []);

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
      setError(tr("2MB 이하의 PDF 문서를 선택해 주세요.", "Choose a PDF no larger than 2 MB."));
      return;
    }
    if (!consent) {
      setError(tr("개인정보 가림 처리 및 분석 전송 동의를 확인해 주세요.", "Confirm the fictional-document and analysis consent before continuing."));
      return;
    }
    setBusy(true);
    setProgress("PDF 읽는 중");
    setElapsed(0);
    const started = Date.now();
    const clock = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Hash the file locally BEFORE any upload. Unknown/real PDFs never leave
      // this browser through the registry import flow; server rechecks the hash.
      if (!capability?.acceptedHashes?.length || !globalThis.crypto?.subtle) {
        throw new Error(tr("가상 PDF 검증 설정을 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해 주세요.", "Could not load the approved sample list. Refresh the page and try again."));
      }
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const fingerprint = Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
      if (!capability.acceptedHashes.includes(fingerprint)) {
        throw new Error(tr("제공된 가상 PDF 예시만 업로드할 수 있습니다. 실제 등기 문서는 전송하지 않았습니다.", "Only the provided fictional PDF samples are accepted. Your document was not sent."));
      }
      const parts: string[] = [];
      for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192))));
      setProgress("서버로 전송 중");
      const res = await fetch("/api/listings/import-registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/x-ndjson",
          ...(process.env.NEXT_PUBLIC_WRITE_TOKEN ? { "x-write-token": process.env.NEXT_PUBLIC_WRITE_TOKEN } : {}),
          ...authHeaders(),
        },
        body: JSON.stringify({ filename: file.name, pdf_base64: btoa(parts.join("")), consent }),
      });
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("application/x-ndjson")) {
        const fallback = await res.json().catch(() => null) as DraftResponse | null;
        if (!res.ok || !fallback?.draft) throw new Error(fallback?.error ?? tr("문서 분석 서버가 정상 응답하지 않았습니다.", "The document service did not return a valid result."));
        setResult(fallback);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { type: string; message?: string; body?: DraftResponse; status?: number };
        if (event.type === "status" && event.message) setProgress(event.message);
        if (event.type === "result") {
          completed = true;
          if ((event.status ?? 500) >= 400 || !event.body?.draft) throw new Error(event.body?.error ?? tr("문서 분석에 실패했습니다.", "Document analysis failed."));
          setResult(event.body);
          setProgress("분석 완료 · 추출 결과 확인");
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let index: number;
          while ((index = pending.indexOf("\n")) >= 0) {
            handle(pending.slice(0, index));
            pending = pending.slice(index + 1);
          }
        }
        pending += decoder.decode();
        if (pending.trim()) handle(pending);
        if (!completed) throw new Error(tr("서버 연결이 분석 도중 종료되었습니다. 다시 시도해 주세요.", "The connection ended before analysis completed. Please try again."));
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(/Failed to fetch|Load failed|NetworkError|fetch failed/i.test(message)
        ? tr("서버와 연결할 수 없습니다. 네트워크 상태를 확인해 주세요. 유료 분석이 중복될 수 있어 자동 재시도하지 않습니다.", "Cannot connect to the server. Check your network. We do not retry automatically because analysis may incur another charge.")
        : (message || tr("문서 분석에 실패했습니다.", "Document analysis failed.")));
    } finally {
      window.clearInterval(clock);
      setBusy(false);
    }
  };

  const draft = result?.draft;
  const entries: Array<{ title: string; field: { value: string; evidence: string } }> = draft ? [
    { title: tr("주소", "Address"), field: draft.address },
    { title: tr("전유부분 면적", "Exclusive floor area (m²)"), field: draft.exclusiveAreaSqm },
    { title: tr("건물 유형", "Building type"), field: draft.buildingType },
    { title: tr("건물명", "Building name"), field: draft.buildingName },
    { title: tr("동", "Building number"), field: draft.buildingDong },
    { title: tr("층", "Floor"), field: draft.floor },
    { title: tr("호수", "Unit number"), field: draft.unit },
  ] : [];
  const canApply = !!draft && draft.documentKind === "registry" && !!(draft.address.value || draft.exclusiveAreaSqm.value || draft.buildingType.value);
  return (
    <section className="registry-import" aria-label={tr("AI 문서 기반 매물 등록", "Create a listing draft from a registry PDF")}>
      <div className="registry-import-head">
        <span className="registry-spark" aria-hidden="true">✦</span>
        <div>
          <span className="eyebrow">{capability?.provider === "mock" ? "MOCK DEMO · DOCUMENT TO DRAFT" : "META AI · DOCUMENT TO DRAFT"}</span>
          <h2>{tr("등기 문서로 등록 초안 만들기", "Start a listing draft from a registry PDF")}</h2>
          <p>{tr("주소·전유면적을 일일이 입력하지 마세요. PDF에서 확인 가능한 항목만 초안으로 가져옵니다.", "Prefill the address and exclusive floor area using only details supported by the PDF.")}</p>
        </div>
      </div>
      {capability?.provider === "mock" ? (
        <p className="registry-mode-note" role="status">
          {tr("현재는 ", "This is an ")}<strong>{tr("오프라인 Mock 시연", "offline Mock demonstration")}</strong>{tr("입니다. 지정된 교육용 PDF 예시만 분석할 수 있으며, 실제 Meta 모델 추출이 아닙니다. 실제 등기 PDF는 이 화면에서 분석할 수 없습니다.", ". Only approved educational PDFs are accepted. This is not a Meta model extraction; real registry documents are not accepted here.")}
        </p>
      ) : capability?.provider === "meta" && !capability.enabled ? (
        <p className="registry-mode-note" role="status">
          {tr("현재 Meta PDF 분석 기능이 비활성화되어 있습니다. 서버 설정을 확인해 주세요.", "Meta PDF analysis is currently disabled. Check the server configuration.")}
        </p>
      ) : capability?.provider === "meta" ? (
        <p className="registry-mode-note" role="status">
          {tr("Meta Muse Spark 시연 모드입니다. 정확히 일치하는 가상 예시 PDF만 Meta에 전송하며 실제 등기 PDF는 전송하지 않습니다.", "Meta Muse Spark demo mode sends only exact-match fictional sample PDFs to Meta. Real registry PDFs are not sent.")}
        </p>
      ) : null}
      <p className="registry-warning">
        <strong>{tr("시연 전용 · 진위 확인 아님.", "Demo only · Not verification of authenticity.")}</strong>{" "}{tr("등기부에는 개인정보와 권리관계가 포함될 수 있습니다. 실제 등기부나 개인정보가 있는 문서는 업로드하지 마세요. 이 기능은 제공된 가상 PDF 시연 예시만 허용합니다.", "Registry records may contain personal and legal information. Do not upload real records or personal data. Only the provided fictional demo PDFs are accepted.")}
      </p>
      <div className="registry-actions">
        <label htmlFor="registry-pdf" className="registry-file-label">{tr("PDF 파일 선택", "Choose a PDF")}</label>
        <input id="registry-pdf" type="file" accept=".pdf,application/pdf" onChange={onFile} disabled={busy} />
        <a className="btn ghost registry-example-link" href="/api/listings/import-registry/sample" download>{tr("가상 PDF 예시 내려받기 ↗", "Download a fictional sample PDF ↗")}</a>
      </div>
      <p className="meta">{file ? (en ? `Selected file: ${file.name}` : `선택된 파일: ${file.name}`) : tr("예시 PDF로 먼저 체험할 수 있습니다.", "Try the sample PDF first.")} · {tr("최대 2MB", "Up to 2 MB")}</p>
      <label className="registry-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
        <span>{tr("제공된 가상 시연 PDF임을 확인합니다. Meta 모드에서는 해당 합성 PDF가 Meta Model API로 1회 전송됩니다. 실제 등기부·개인정보 문서는 허용하지 않습니다.", "I confirm this is an approved fictional demo PDF. In Meta mode, it is sent once to the Meta Model API. Real registry records and personal documents are not allowed.")}</span>
      </label>
      <button className="btn" onClick={analyze} disabled={busy || !file || !consent || !capability?.acceptedHashes?.length || !capability.enabled}>{busy ? (capability?.sampleOnly ? tr("가상 PDF 확인 중...", "Checking the fictional PDF...") : tr("Meta AI 문서 분석 중...", "Analyzing with Meta AI...")) : tr("AI로 매물 정보 추출하기", "Extract draft property details")}</button>
      {busy ? <div className="registry-progress" role="status" aria-live="polite"><span className="registry-spinner" aria-hidden="true" /><strong>{progress ? registryImportMessage(progress, en) : tr("문서 분석 중", "Analyzing document")}</strong><span>{en ? `${elapsed}s elapsed` : `${elapsed}초 경과`}</span><p>{tr("Meta 분석에는 수십 초가 걸릴 수 있습니다. 페이지를 닫지 마세요.", "Analysis may take a while. Keep this page open.")}</p></div> : null}
      {error ? <p className="error" role="alert">{registryImportMessage(error, en)}</p> : null}
      {draft ? <div className="registry-review">
        <div className="registry-review-head"><h3>{tr("추출 결과 미리보기", "Review the extracted draft")}</h3><span className="pill">{result?.provider === "meta" ? "Meta Muse Spark" : tr("가상 샘플 Mock", "Fictional sample · Mock")}</span></div>
        <p className="meta">{tr("모델이 제시한 문서 발췌를 PDF 원본과 대조해 주세요. 추출값은 검증된 등기 사실이나 소유권 증명이 아닙니다.", "Compare each excerpt with the original PDF. Draft values are not verified registry facts or proof of ownership. Original-language names, addresses and excerpts are preserved below.")}</p>
        <dl className="registry-fields">
          {entries.map(({ title, field }) => (
            <div key={title} className="registry-field">
              <dt>{title}</dt>
              <dd><strong data-source-text lang={/[가-힣]/.test(field.value) ? "ko" : undefined}>{field.value || tr("확인 필요", "Needs review")}</strong>{en && registryFieldGloss(field.value) ? <small>{registryFieldGloss(field.value)}</small> : null}{field.evidence ? <small>{tr("추출 근거(시연/모델): ", "Source excerpt (original language): ")}<span data-source-text lang={/[가-힣]/.test(field.evidence) ? "ko" : undefined}>{field.evidence}</span></small> : null}</dd>
            </div>
          ))}
        </dl>
        {draft.cautions.map((warning) => <p className="registry-caution" key={warning}>{registryImportMessage(warning, en)}</p>)}
        <button type="button" className="btn" disabled={!canApply || applied} onClick={() => {
          if (!draft) return;
          onApply({ title: registryDraftTitle(draft, en), address: draft.address.value, area: draft.exclusiveAreaSqm.value });
          setApplied(true);
        }}>{applied ? tr("초안이 입력됐습니다", "Draft applied") : tr("비어 있는 등록 항목에 반영하기", "Fill empty listing fields")}</button>
        <p className="meta">{tr("적용해도 매물은 게시되지 않습니다. 거래가격·관리비·입주일·옵션을 추가하고 최종 등록 버튼을 눌러야 합니다.", "Applying the draft does not publish a listing. Add your terms, fees, availability and amenities, then explicitly save the listing.")}</p>
      </div> : null}
    </section>
  );
}
