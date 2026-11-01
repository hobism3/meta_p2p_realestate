"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { authHeaders } from "../lib/client-auth";
import {
  imageDifferenceHash, nearDuplicateHash, photoQualityHints, recommendedPhotoRooms,
  PHOTO_PRIVACY_LABELS, PHOTO_ROOM_NAMES, type PhotoReview,
} from "../lib/photo-guide";

type Item = {
  id: number; name: string; blob: Blob; url: string; metrics: { width: number; height: number; brightness: number; fileBytes: number };
  hash: string; suggestions: string[]; review?: PhotoReview; reviewed?: boolean; masked: boolean;
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

export default function ListingPhotoGuide({ onSuggestOptions }: { onSuggestOptions: (values: string[]) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [maskId, setMaskId] = useState<number | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draftMask, setDraftMask] = useState<Mask | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seq = useRef(0);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    fetch("/api/listings/photo-review").then((r) => r.json()).then((v) => setEnabled(v.enabled === true)).catch(() => {});
    return () => { for (const u of urls.current) URL.revokeObjectURL(u); };
  }, []);
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError("");
    if (items.length + files.length > 6) { setError("사진은 최대 6장까지 검토할 수 있어요."); return; }
    const next: Item[] = [];
    try {
      for (const f of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024) {
          throw new Error("JPG·PNG·WebP 파일(장당 8MB 이하)만 선택해 주세요.");
        }
        const img = await imageFromBlob(f);
        const canvas = canvasFor(img, 1600);
        const info = metricsAndHash(canvas, f.size);
        const blob = await jpegBlob(canvas);
        const url = URL.createObjectURL(blob); urls.current.push(url);
        const dup = [...items, ...next].some((v) => nearDuplicateHash(v.hash, info.hash));
        next.push({
          id: ++seq.current, name: f.name.slice(0, 100), blob, url, ...info, masked: false,
          suggestions: [...photoQualityHints(info.metrics), ...(dup ? ["다른 사진과 비슷해 보여요."] : [])],
        });
      }
      setItems((prev) => [...prev, ...next]);
    } catch (err) { setError(err instanceof Error ? err.message : "사진을 읽지 못했어요."); }
  };
  const remove = (id: number) => {
    setItems((prev) => {
      const target = prev.find((v) => v.id === id);
      if (target) { URL.revokeObjectURL(target.url); urls.current = urls.current.filter((u) => u !== target.url); }
      return prev.filter((v) => v.id !== id);
    });
  };
  const pos = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  const paint = (base: HTMLImageElement, rects: Mask[]) => {
    const c = canvasFor(base, 1600);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("마스킹 지원 환경이 아니에요.");
    // Solid opaque cover, not reversible blur. No text can be recovered underneath.
    ctx.fillStyle = "#263144";
    for (const m of rects) ctx.fillRect(m.x * c.width, m.y * c.height, m.w * c.width, m.h * c.height);
    return c;
  };
  useEffect(() => {
    if (maskId === null) return;
    const item = items.find((v) => v.id === maskId);
    const canvas = canvasRef.current;
    if (!canvas || !item) return;
    imageFromBlob(item.blob).then((img) => {
      const c = paint(img, masks);
      canvas.width = c.width; canvas.height = c.height;
      const ctx = canvas.getContext("2d"); ctx?.drawImage(c, 0, 0);
      if (ctx && draftMask) {
        ctx.strokeStyle = "#ffb232"; ctx.lineWidth = Math.max(3, c.width / 250);
        ctx.strokeRect(draftMask.x * c.width, draftMask.y * c.height, draftMask.w * c.width, draftMask.h * c.height);
      }
    }).catch(() => setError("사진 표시 실패"));
  }, [maskId, masks, draftMask, items]);
  const saveMask = async () => {
    const item = items.find((v) => v.id === maskId);
    if (!item || !masks.length) { setMaskId(null); return; }
    try {
      const img = await imageFromBlob(item.blob);
      const blob = await jpegBlob(paint(img, masks));
      const url = URL.createObjectURL(blob); urls.current.push(url);
      URL.revokeObjectURL(item.url); urls.current = urls.current.filter((u) => u !== item.url);
      setItems((prev) => prev.map((v) => v.id === item.id ? {
        ...v, blob, url, masked: true, review: undefined, reviewed: false,
      } : v));
      setMaskId(null); setMasks([]);
    } catch { setError("마스킹 저장에 실패했어요."); }
  };
  const analyze = async (item: Item) => {
    if (!consent || busyId !== null) return;
    setBusyId(item.id); setError("");
    try {
      let blob = item.blob;
      // Extra size bound for a single paid image call.
      const img = await imageFromBlob(blob);
      for (const edge of [1024, 800, 640, 480]) {
        blob = await jpegBlob(canvasFor(img, edge), 0.65);
        if (blob.size <= 950_000) break;
      }
      if (blob.size > 950_000) throw new Error("사진 크기를 줄이지 못했습니다.");
      const response = await fetch("/api/listings/photo-review", {
        method: "POST", headers: {
          "Content-Type": "application/json", ...authHeaders(),
          ...(process.env.NEXT_PUBLIC_WRITE_TOKEN ? { "x-write-token": process.env.NEXT_PUBLIC_WRITE_TOKEN } : {}),
        },
        body: JSON.stringify({ image: await toDataUrl(blob), consent: true }),
      });
      const body = await response.json() as { error?: string; review?: PhotoReview };
      if (!response.ok || !body.review) throw new Error(body.error ?? "분석하지 못했어요.");
      setItems((prev) => prev.map((v) => v.id === item.id ? { ...v, review: body.review, reviewed: true } : v));
    } catch (err) { setError(err instanceof Error ? err.message : "AI 분석에 실패했어요."); }
    finally { setBusyId(null); }
  };
  const found = items.filter((v) => v.review).map((v) => v.review!);
  const suggested = Array.from(new Set(found.flatMap((v) => v.features)));
  const missing = recommendedPhotoRooms(found);
  return (
    <section className="card photo-guide" aria-label="매물 사진 등록 가이드">
      <div className="section-head"><div><span className="eyebrow">PHOTO REGISTRATION ASSISTANT</span><h2>우리 집 사진 점검</h2></div><span className="meta">{items.length}/6장</span></div>
      <p className="meta">사진을 고르면 이 브라우저에서 품질과 비슷한 사진을 검사해요. 사진은 아직 서버·매물에 저장되지 않으며 공개되지 않아요.</p>
      <label className="btn ghost" style={{ display: "inline-block", cursor: "pointer", margin: "12px 0" }}>
        사진 고르기 <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} aria-label="매물 사진 선택" style={{ display: "none" }} />
      </label>
      <p className="meta">얼굴·문서·액자·모니터·택배 라벨이 있다면 아래 '가리기'로 직접 가린 다음 분석하세요. 자동 개인정보 탐지는 완전하지 않습니다.</p>
      <div className="photo-guide-grid">
        {items.map((item) => (
          <article className="photo-guide-item" key={item.id}>
            <img src={item.url} alt={"선택한 매물 사진 " + item.name} />
            <div className="photo-guide-item-text">
              <strong>{item.name}</strong>
              <small>{item.metrics.width}×{item.metrics.height} · {Math.round(item.blob.size / 1024)}KB · {item.masked ? "일부 가림" : "원본 화면"}</small>
              {item.suggestions.map((hint) => <p key={hint} className="photo-guide-hint">• {hint}</p>)}
              {item.review ? <>
                <p><b>공간 후보:</b> {PHOTO_ROOM_NAMES[item.review.room]}</p>
                <p><b>보이는 물건:</b> {item.review.features.join(", ") || "인식된 항목 없음"}</p>
                {item.review.privacyFlags.length ? <p className="photo-guide-warning">개인정보 노출 후보: {item.review.privacyFlags.map((k) => PHOTO_PRIVACY_LABELS[k]).join(", ")} · 직접 확인하세요.</p> : null}
              </> : null}
              <div className="photo-guide-actions">
                <button type="button" className="btn ghost" onClick={() => { setMaskId(item.id); setMasks([]); }}>가리기</button>
                <button type="button" className="btn ghost" onClick={() => void analyze(item)} disabled={!enabled || !consent || busyId !== null}>
                  {busyId === item.id ? "사진 검토 중..." : item.reviewed ? "AI 재분석" : "AI 공간·옵션 분석"}
                </button>
                <button type="button" className="btn ghost" onClick={() => remove(item.id)} disabled={busyId !== null}>제거</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <label className="photo-guide-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>내가 가림 상태를 확인했고, 선택한 사진을 Meta AI로 전송하는 데 동의합니다. 사진에는 개인정보가 남아 있을 수 있어요.</span>
      </label>
      <p className="meta">{enabled ? "Meta 분석은 선택한 사진에만 실행되며, 결과는 참고용입니다." : "현재 Meta 사진 분석은 비활성화되어 있습니다. 로컬 사진 검사·가리기는 사용할 수 있어요."}</p>
      {missing.length ? <p className="photo-guide-tip">추가 촬영을 고려해 보세요: {missing.join(", ")}. 집 구조에 없는 공간은 제외하세요.</p> : null}
      {suggested.length ? <div className="photo-guide-tip">
        <p><strong>사진에서 발견된 옵션 후보</strong> · 실제 제공되는 물건인지 집주인이 확인해 주세요.</p>
        <p>{suggested.join(" · ")}</p>
        <button type="button" className="btn ghost" onClick={() => onSuggestOptions(suggested)}>내 옵션 입력란에 후보 추가</button>
      </div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {maskId !== null ? <div className="photo-guide-mask">
        <h3>가릴 부분을 사각형으로 선택</h3>
        <p className="meta">선택한 영역은 복원하기 어려운 불투명 색으로 덮어요. 저장 전에 영역을 확인하세요.</p>
        <canvas ref={canvasRef} style={{ width: "100%", height: "auto", touchAction: "none", cursor: "crosshair" }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setStart(pos(e)); }}
          onPointerMove={(e) => { if (!start) return; const p = pos(e); setDraftMask({ x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }); }}
          onPointerUp={(e) => { if (!start) return; const p = pos(e); const m = { x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; if (m.w > 0.005 && m.h > 0.005) setMasks((v) => [...v, m]); setStart(null); setDraftMask(null); }}
          onPointerCancel={() => { setStart(null); setDraftMask(null); }} />
        <div className="photo-guide-actions">
          <button type="button" className="btn ghost" onClick={() => setMasks((prev) => prev.slice(0, -1))}>마지막 영역 취소</button>
          <button type="button" className="btn" onClick={() => void saveMask()}>가림 적용</button>
          <button type="button" className="btn ghost" onClick={() => { setMaskId(null); setMasks([]); }}>닫기</button>
        </div>
      </div> : null}
    </section>
  );
}
