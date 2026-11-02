"use client";
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { authHeaders } from "../lib/client-auth";
import {
  imageDifferenceHash, nearDuplicateHash, photoQualityHints, recommendedPhotoRooms,
  photoCoverageMessages, photoOptionCandidates,
  PHOTO_PRIVACY_LABELS, PHOTO_ROOM_NAMES, type PhotoReview,
} from "../lib/photo-guide";

type Item = {
  id: number; name: string; blob: Blob; url: string; metrics: { width: number; height: number; brightness: number; fileBytes: number };
  hash: string; suggestions: string[]; review?: PhotoReview; reviewed?: boolean; masked: boolean;
  redactions: Mask[]; emptyPreview?: string;
};
type Mask = { x: number; y: number; w: number; h: number };

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없어요.")); };
    img.src = url;
  });
}
function canvasFor(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function jpegBlob(c: HTMLCanvasElement, quality = 0.78): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((v) => v ? resolve(v) : reject(new Error("사진 변환 실패")), "image/jpeg", quality));
}
function metricsAndHash(c: HTMLCanvasElement, originalBytes: number) {
  const small = document.createElement("canvas"); small.width = 9; small.height = 8;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("사진 검사를 지원하지 않는 브라우저예요.");
  ctx.drawImage(c, 0, 0, 9, 8);
  const raw = ctx.getImageData(0, 0, 9, 8).data;
  const gray: number[] = [];
  let sum = 0;
  for (let i = 0; i < raw.length; i += 4) {
    const v = 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
    gray.push(v); sum += v;
  }
  return { hash: imageDifferenceHash(gray), metrics: {
    width: c.width, height: c.height, brightness: Math.round(sum / 72), fileBytes: originalBytes,
  } };
}
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일 변환 실패"));
    reader.readAsDataURL(blob);
  });
}


/** One integrated photo-to-listing workflow. AI analysis is an implementation detail, not a separate product tab. */
export default function ListingPhotoGuide({ onSuggestOptions }: { onSuggestOptions: (values: string[]) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [editConsent, setEditConsent] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [available, setAvailable] = useState({ vision: false, imageEdit: false });
  const [chosenOptions, setChosenOptions] = useState<string[]>([]);
  const [maskId, setMaskId] = useState<number | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draftMask, setDraftMask] = useState<Mask | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seq = useRef(0);
  const urls = useRef<string[]>([]);
  const locked = analyzing || editingId !== null || maskId !== null;

  useEffect(() => {
    Promise.all([
      fetch("/api/listings/photo-review", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch("/api/listings/photo-empty-view", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]).then(([v, e]) => setAvailable({ vision: v?.enabled === true, imageEdit: e?.enabled === true }))
      .catch(() => {});
    return () => { for (const url of urls.current) URL.revokeObjectURL(url); };
  }, []);

  const track = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };
  const untrack = (url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current = urls.current.filter((v) => v !== url);
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (locked) return;
    setError("");
    if (items.length + files.length > 6) { setError("사진은 한 번에 최대 6장까지 정리할 수 있어요."); return; }
    const next: Item[] = [];
    try {
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 8 * 1024 * 1024 || file.size < 100) {
          throw new Error("JPG·PNG·WebP 사진(장당 8MB 이하)만 선택해 주세요.");
        }
        const image = await imageFromBlob(file);
        const canvas = canvasFor(image, 1600);
        const info = metricsAndHash(canvas, file.size);
        const blob = await jpegBlob(canvas);
        const duplicate = [...items, ...next].some((old) => nearDuplicateHash(old.hash, info.hash));
        const url = track(blob);
        next.push({
          id: ++seq.current, name: file.name.slice(0, 100), blob, url, ...info,
          masked: false, redactions: [],
          suggestions: [...photoQualityHints(info.metrics), ...(duplicate ? ["유사한 사진이 있어요. 다른 각도로 촬영하면 좋아요."] : [])],
        });
      }
      setItems((old) => [...old, ...next]);
    } catch (err) {
      for (const item of next) untrack(item.url);
      setError(err instanceof Error ? err.message : "사진을 읽지 못했어요.");
    }
  };

  const remove = (id: number) => {
    const target = items.find((v) => v.id === id);
    untrack(target?.url); untrack(target?.emptyPreview);
    setItems((old) => old.filter((v) => v.id !== id));
  };

  const pointerPos = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
  };
  const paint = (image: HTMLImageElement, rectangles: readonly Mask[]) => {
    const canvas = canvasFor(image, 1600);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진 가림을 사용할 수 없는 브라우저예요.");
    context.fillStyle = "#263144";
    for (const m of rectangles) context.fillRect(m.x * canvas.width, m.y * canvas.height, m.w * canvas.width, m.h * canvas.height);
    return canvas;
  };

  useEffect(() => {
    if (maskId === null) return;
    const target = items.find((v) => v.id === maskId);
    const canvas = canvasRef.current;
    if (!target || !canvas) return;
    let cancelled = false;
    imageFromBlob(target.blob).then((image) => {
      if (cancelled) return;
      const output = paint(image, masks);
      canvas.width = output.width; canvas.height = output.height;
      const context = canvas.getContext("2d");
      context?.drawImage(output, 0, 0);
      if (context && draftMask) {
        context.strokeStyle = "#ffba42";
        context.lineWidth = Math.max(3, canvas.width / 250);
        context.strokeRect(draftMask.x * canvas.width, draftMask.y * canvas.height,
          draftMask.w * canvas.width, draftMask.h * canvas.height);
      }
    }).catch(() => setError("사진을 표시하지 못했어요."));
    return () => { cancelled = true; };
  }, [maskId, items, masks, draftMask]);

  const saveMask = async () => {
    const item = items.find((v) => v.id === maskId);
    if (!item || !masks.length) { setMaskId(null); setMasks([]); return; }
    try {
      const img = await imageFromBlob(item.blob);
      const blob = await jpegBlob(paint(img, masks));
      const newUrl = track(blob);
      untrack(item.url); untrack(item.emptyPreview);
      setItems((old) => old.map((v) => v.id === item.id ? {
        ...v, blob, url: newUrl, masked: true, redactions: [...v.redactions, ...masks],
        emptyPreview: undefined, review: undefined, reviewed: false,
      } : v));
      setMaskId(null); setMasks([]); setChosenOptions([]);
    } catch { setError("사진 가림 적용에 실패했어요."); }
  };

  const modelJpeg = async (source: Blob) => {
    const original = await imageFromBlob(source);
    let output = source;
    for (const edge of [1024, 800, 640, 480]) {
      output = await jpegBlob(canvasFor(original, edge), 0.65);
      if (output.size <= 950_000) return output;
    }
    throw new Error("사진 용량을 줄이지 못했어요.");
  };

  const analyzeAll = async () => {
    if (analyzing || editingId !== null || !consent || !available.vision) return;
    const pending = items.filter((v) => !v.reviewed);
    if (!pending.length) return;
    setError(""); setAnalyzing(true); setChosenOptions([]);
    const failures: string[] = [];
    for (let index = 0; index < pending.length; index++) {
      const item = pending[index];
      setAnalysisProgress("사진에서 공간과 옵션을 찾는 중 · " + (index + 1) + "/" + pending.length);
      try {
        const jpeg = await modelJpeg(item.blob);
        const reply = await fetch("/api/listings/photo-review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json", ...authHeaders(),
            ...(process.env.NEXT_PUBLIC_WRITE_TOKEN ? { "x-write-token": process.env.NEXT_PUBLIC_WRITE_TOKEN } : {}),
          },
          body: JSON.stringify({ consent: true, image: await toDataUrl(jpeg) }),
        });
        const data = await reply.json() as { error?: string; review?: PhotoReview };
        if (!reply.ok || !data.review) throw new Error(data.error || "사진 분석 실패");
        setItems((old) => old.map((v) => v.id === item.id ? { ...v, review: data.review, reviewed: true } : v));
      } catch (err) {
        failures.push((index + 1) + "번째 사진: " + (err instanceof Error ? err.message : "분석 불가"));
      }
    }
    setAnalyzing(false); setAnalysisProgress("");
    if (failures.length) setError(failures.join(" / ") + " · 성공한 사진은 보존되며 자동 재시도하지 않아요.");
  };

  const previewEmptyRoom = async (item: Item) => {
    if (!editConsent || !available.imageEdit || locked) return;
    setError(""); setEditingId(item.id);
    try {
      const jpeg = await modelJpeg(item.blob);
      const reply = await fetch("/api/listings/photo-empty-view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json", ...authHeaders(),
          ...(process.env.NEXT_PUBLIC_WRITE_TOKEN ? { "x-write-token": process.env.NEXT_PUBLIC_WRITE_TOKEN } : {}),
        },
        body: JSON.stringify({ consent: true, purpose: "empty-room-preview", image: await toDataUrl(jpeg) }),
      });
      const data = await reply.json() as { error?: string; image?: string; kind?: string };
      if (!reply.ok || data.kind !== "ai_simulation" || !data.image?.startsWith("data:image/webp;base64,")) {
        throw new Error(data.error || "생성된 이미지를 읽지 못했어요.");
      }
      // Keep a local blob only. Always repaint all privacy rectangles over the
      // generated image because an image model may invent masked-out content.
      const generated = await (await fetch(data.image)).blob();
      const generatedImage = await imageFromBlob(generated);
      const safe = item.redactions.length
        ? await jpegBlob(paint(generatedImage, item.redactions))
        : generated;
      const previewUrl = track(safe);
      untrack(item.emptyPreview);
      setItems((old) => old.map((v) => v.id === item.id ? { ...v, emptyPreview: previewUrl } : v));
    } catch (err) {
      setError(err instanceof Error ? err.message : "빈 공간 이미지를 만들지 못했어요.");
    } finally { setEditingId(null); }
  };

  const reviewed = items.filter((v) => v.reviewed && v.review).map((v) => v.review!);
  const options = photoOptionCandidates(reviewed);
  const missing = photoCoverageMessages(reviewed);
  const pendingCount = items.filter((v) => !v.reviewed).length;
  const toggle = (value: string) => setChosenOptions((old) =>
    old.includes(value) ? old.filter((v) => v !== value) : [...old, value]);

  return (
    <section className="card photo-guide" aria-label="사진으로 매물 정보 정리하기">
      <div className="section-head">
        <div><span className="eyebrow">AI LISTING ASSISTANT</span><h2>사진으로 우리 집 정보 정리하기</h2></div>
        <span className="meta">{items.length}/6장</span>
      </div>
      <p className="meta">사진에서 공간과 가전·가구를 찾아 옵션 후보를 만들고, 빠진 공간 사진도 안내해요. 집을 구하는 사람과의 채팅에는 개입하지 않아요.</p>
      <label className="btn ghost photo-guide-upload">
        사진 추가하기
        <input type="file" aria-label="우리 집 사진 추가" accept="image/jpeg,image/png,image/webp"
          multiple onChange={upload} disabled={locked} />
      </label>
      <p className="meta">선택한 사진은 아직 매물에 저장되거나 공개되지 않아요. 가구 제거 결과도 매물에 게시되지 않습니다.</p>

      <div className="photo-guide-grid">
        {items.map((item) => (
          <article className="photo-guide-item" key={item.id}>
            <img src={item.url} alt={"매물 사진 원본 또는 일부 가림 처리본: " + item.name} />
            <div className="photo-guide-item-text">
              <strong>{item.name}</strong>
              <small>{item.metrics.width}×{item.metrics.height} · {Math.round(item.blob.size / 1024)}KB · {item.masked ? "개인 영역 가림 적용" : "가림 미적용"}</small>
              {item.suggestions.map((hint) => <p className="photo-guide-hint" key={hint}>· {hint}</p>)}
              {item.review ? (
                <>
                  <p><b>{PHOTO_ROOM_NAMES[item.review.room]}</b> 사진으로 분류했어요.</p>
                  {item.review.features.length ? <p>보이는 물건: {item.review.features.join(", ")}</p> : null}
                  {item.review.privacyFlags.length ? <p className="photo-guide-warning">
                    가림 확인이 필요한 부분: {item.review.privacyFlags.map((v) => PHOTO_PRIVACY_LABELS[v]).join(", ")}
                  </p> : null}
                </>
              ) : null}
              <div className="photo-guide-actions">
                <button type="button" className="btn ghost" disabled={locked} onClick={() => { setMaskId(item.id); setMasks([]); }}>
                  개인 물품 가리기
                </button>
                <button type="button" className="btn ghost" disabled={locked} onClick={() => remove(item.id)}>삭제</button>
              </div>
              <div className="photo-guide-empty-action">
                <button type="button" className="btn ghost"
                  disabled={!editConsent || !available.imageEdit || locked}
                  onClick={() => void previewEmptyRoom(item)}>
                  {editingId === item.id ? "빈 공간 이미지 생성 중..." : item.emptyPreview ? "가구 없는 모습 다시 만들기" : "가구 없는 모습 미리보기"}
                </button>
              </div>
            </div>
            {item.emptyPreview ? (
              <div className="photo-guide-comparison">
                <figure><img src={item.url} alt="원본 또는 가림 처리한 사진" /><figcaption>원본 사진</figcaption></figure>
                <figure><img src={item.emptyPreview} alt="가구를 없앤 AI 예상 이미지" /><figcaption>AI 가상 이미지 · 실제 모습 아님</figcaption></figure>
                <p>AI가 보이지 않는 바닥·벽을 추정해 채울 수 있어요. 실제 면적, 구조, 하자 상태 확인 자료로 사용하지 마세요.</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="photo-guide-tip">
        <strong>사진을 올리기 전 개인정보를 가려 주세요</strong>
        <p>가족 사진, 문서, 사람, 화면, 택배 라벨, 거울 반사 등을 직접 확인하고 '개인 물품 가리기'로 덮어 주세요. AI도 모든 노출을 찾아내지는 못해요.</p>
      </div>
      <label className="photo-guide-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>사진을 확인했고, 매물 정보 초안 추출을 위해 선택한 사진을 Meta Vision AI로 보내는 데 동의합니다.</span>
      </label>
      <button type="button" className="btn photo-guide-primary"
        disabled={!items.length || !pendingCount || !consent || !available.vision || locked}
        onClick={() => void analyzeAll()}>
        {analyzing ? analysisProgress : reviewed.length ? "추가한 사진까지 매물 정보 정리하기" : "사진에서 옵션·공간 자동 정리"}
      </button>
      {!available.vision ? <p className="meta">현재 사진 AI 분석이 비활성화되어 있어요. 사진 확인과 가림 기능은 사용할 수 있습니다.</p> : (
        <p className="meta">선택한 사진을 1장씩 분석합니다. 분석이 끝나도 매물 정보는 자동 확정하지 않아요.</p>
      )}

      {reviewed.length ? (
        <section className="photo-guide-suggestions" aria-label="자동으로 찾은 매물 정보">
          <h3>AI가 사진 {reviewed.length}장에서 찾아낸 내용</h3>
          <p>공간: {Array.from(new Set(reviewed.map((v) => PHOTO_ROOM_NAMES[v.room]))).join(" · ")}</p>
          {options.length ? (
            <>
              <h4>사진에 보이는 옵션 후보</h4>
              <p className="meta">사진에 보인다는 이유만으로 임대할 때 제공되는 옵션이라고 확정할 수 없어요. 실제 제공하는 물건만 선택해 주세요.</p>
              <div className="photo-guide-option-chips">
                {options.map((value) => <button type="button" className={"feature-chip" + (chosenOptions.includes(value) ? " is-selected" : "")}
                  key={value} aria-pressed={chosenOptions.includes(value)} onClick={() => toggle(value)}>
                  {chosenOptions.includes(value) ? "✓ " : "+ "}{value}
                </button>)}
              </div>
              <button type="button" className="btn ghost" disabled={!chosenOptions.length}
                onClick={() => { onSuggestOptions(chosenOptions); setChosenOptions([]); }}>
                선택한 {chosenOptions.length}개를 매물 옵션 입력란에 추가
              </button>
            </>
          ) : <p className="meta">제안할 가전·가구 옵션이 아직 확인되지 않았어요.</p>}
          {missing.length ? (
            <div className="photo-guide-tip" aria-label="추가하면 좋은 사진">
              <h4>사진을 더 올리면 좋아요</h4>
              {missing.map((message) => <p key={message}>{message}</p>)}
            </div>
          ) : <p className="photo-guide-tip">거실/침실·주방·욕실에 해당하는 사진이 확인됐어요. 필요한 다른 공간도 올려 주세요.</p>}
          {pendingCount ? <p className="meta">아직 분석되지 않은 사진이 {pendingCount}장 있어요. 누락 안내는 참고만 해 주세요.</p> : null}
        </section>
      ) : null}

      <div className="photo-guide-tip">
        <strong>선택 기능: 가구 없는 공간 보기</strong>
        <p>사진에서 이동 가능한 가구와 생활용품을 없애 공간을 가상으로 보여 줍니다. AI가 보이지 않는 부분을 만들어 내므로 집의 실측이나 현장 정보로 사용할 수 없어요.</p>
        <label className="photo-guide-consent">
          <input type="checkbox" checked={editConsent} onChange={(e) => setEditConsent(e.target.checked)} />
          <span>AI 가상 이미지 생성을 위해 선택한 사진을 Meta Muse Image로 별도 전송하는 데 동의합니다.</span>
        </label>
        {!available.imageEdit ? <p className="meta">현재 가구 없는 이미지 생성 기능은 서버에서 비활성화되어 있습니다.</p> : null}
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {maskId !== null ? <div className="photo-guide-mask" role="group" aria-label="사진 개인정보 가리기">
        <h3>가리고 싶은 부분을 사각형으로 드래그해 주세요</h3>
        <p className="meta">불투명 색으로 덮으며, 이미 처리된 부분도 다시 그릴 수 있어요. AI 편집 결과에는 동일한 가림 영역을 다시 적용합니다.</p>
        <canvas ref={canvasRef} style={{ width: "100%", height: "auto", touchAction: "none", cursor: "crosshair" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setStart(pointerPos(e)); }}
          onPointerMove={(e) => {
            if (!start) return;
            const point = pointerPos(e);
            setDraftMask({ x: Math.min(point.x, start.x), y: Math.min(point.y, start.y),
              w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) });
          }}
          onPointerUp={(e) => {
            if (!start) return;
            const point = pointerPos(e);
            const rect = { x: Math.min(point.x, start.x), y: Math.min(point.y, start.y),
              w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) };
            if (rect.w > 0.005 && rect.h > 0.005) setMasks((prev) => [...prev, rect]);
            setStart(null); setDraftMask(null);
          }}
          onPointerCancel={() => { setStart(null); setDraftMask(null); }} />
        <div className="photo-guide-actions">
          <button type="button" className="btn ghost" onClick={() => setMasks((prev) => prev.slice(0, -1))}>직전 영역 취소</button>
          <button type="button" className="btn" onClick={() => void saveMask()}>가림 적용</button>
          <button type="button" className="btn ghost" onClick={() => { setMaskId(null); setMasks([]); }}>닫기</button>
        </div>
      </div> : null}
    </section>
  );
}
