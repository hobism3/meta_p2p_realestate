"use client";
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { authHeaders } from "../lib/client-auth";
import { PHOTO_DEMO_ASSETS } from "../lib/photo-demo-assets";
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
export default function ListingPhotoGuide({ onSuggestOptions, listingId, onPublished }: {
  onSuggestOptions?: (values: string[]) => void | Promise<void>; listingId?: string; onPublished?: () => void;
 }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [editConsent, setEditConsent] = useState(false);
  const [publicationConsent,setPublicationConsent] = useState(false);
  const [publishingId,setPublishingId] = useState<number|null>(null);
  const [publishedIds,setPublishedIds] = useState<number[]>([]);
  const [publishMessage,setPublishMessage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [available, setAvailable] = useState({ vision: false, imageEdit: false });
  const [chosenOptions, setChosenOptions] = useState<string[]>([]);
  const [applyingOptions,setApplyingOptions] = useState(false);
  const [optionMessage,setOptionMessage] = useState("");
  const [maskId, setMaskId] = useState<number | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draftMask, setDraftMask] = useState<Mask | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskPanelRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const urls = useRef<string[]>([]);
  const locked = analyzing || editingId !== null || publishingId !== null || maskId !== null || applyingOptions;

  useEffect(() => {
    Promise.all([
      fetch("/api/listings/photo-review", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch("/api/listings/photo-empty-view", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]).then(([v, e]) => setAvailable({ vision: v?.enabled === true, imageEdit: e?.enabled === true }))
      .catch(() => {});
    return () => { for (const url of urls.current) URL.revokeObjectURL(url); };
  }, []);

  useEffect(() => {
    if (maskId === null) return;
    const handle = requestAnimationFrame(() => maskPanelRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    return () => cancelAnimationFrame(handle);
  }, [maskId]);

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

  const addFiles = async (files: File[]) => {
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

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files);
  };
  const loadSyntheticDemo = async (example: typeof PHOTO_DEMO_ASSETS[number]) => {
    if (locked || items.length >= 6) return;
    if (items.some((item) => item.name === example.fileName)) {
      setError("이미 추가한 예시 사진입니다."); return;
    }
    try {
      const response = await fetch(example.src, { cache: "force-cache" });
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("image/jpeg")) {
        throw new Error("예시 사진을 불러오지 못했어요.");
      }
      const bytes = await response.blob();
      await addFiles([new File([bytes], example.fileName, { type: "image/jpeg" })]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "예시 사진을 사용할 수 없어요.");
    }
  };

  const remove = (id: number) => {
    if (publishedIds.includes(id)) {
      setError("이미 공개한 사진은 매물 관리의 갤러리에서 삭제할 수 있어요.");
      return;
    }
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

  const analyzeOne = async (item: Item) => {
    if (locked || !consent || !available.vision || item.reviewed) return;
    setError(""); setAnalyzing(true); setAnalysisProgress("사진 AI 분석 중: " + item.name);
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
      setChosenOptions([]);
    } catch (err) {
      setError(item.name + ": " + (err instanceof Error ? err.message : "분석 불가") + " · 자동 재시도하지 않아요.");
    } finally { setAnalyzing(false); setAnalysisProgress(""); }
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

  const publishPhoto = async (item:Item) => {
    if (!listingId || !publicationConsent || locked || publishedIds.includes(item.id)) return;
    if (item.name.startsWith("synthetic-demo-")) {
      setError("시연용 합성 이미지는 실제 매물 사진으로 게시할 수 없습니다.");return;
    }
    if (item.review?.privacyFlags.length && !item.masked) {
      setError("AI에서 개인정보 노출 가능성을 발견했습니다. 해당 영역을 먼저 가려 주세요.");return;
    }
    setError("");setPublishMessage("");setPublishingId(item.id);
    try {
      // Photo is always a newly compressed, metadata-free canvas derivative.
      // Neither the original nor the AI empty-room preview is submitted.
      const source=await imageFromBlob(item.blob);
      let publishJpeg:Blob|null=null;
      for(const edge of [960,800,640,480]){
        const jpeg=await jpegBlob(canvasFor(source,edge),0.60);
        if(jpeg.size<=180000){publishJpeg=jpeg;break;}
      }
      if(!publishJpeg)throw new Error("게시용 JPEG 용량을 180KB 이하로 줄일 수 없습니다.");
      const response=await fetch("/api/listings/"+encodeURIComponent(listingId)+"/gallery",{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(),
          ...(process.env.NEXT_PUBLIC_WRITE_TOKEN?{"x-write-token":process.env.NEXT_PUBLIC_WRITE_TOKEN}:{})},
        body:JSON.stringify({
          image:await toDataUrl(publishJpeg),room:item.review?.room??"unknown",
          masked:item.masked,consentToPublish:true,checkedPersonalInfo:true,clientReencoded:true,
          aiGenerated:false,
        }),
      });
      const answer=await response.json() as {error?:string};
      if(!response.ok)throw new Error(answer.error||"사진 게시에 실패했습니다.");
      setPublishedIds(old=>[...old,item.id]);
      setPublishMessage("실제 매물 갤러리에 사진을 공개했어요. 삭제하거나 변경하려면 매물 관리로 이동해 주세요.");
      onPublished?.();
    }catch(e){setError(e instanceof Error?e.message:"사진 게시 실패");}
    finally{setPublishingId(null);}
  };

  const reviewed = items.filter((v) => v.reviewed && v.review).map((v) => v.review!);
  const options = photoOptionCandidates(reviewed);
  const missing = photoCoverageMessages(reviewed);
  const pendingCount = items.filter((v) => !v.reviewed).length;
  const toggle = (value: string) => setChosenOptions((old) =>
    old.includes(value) ? old.filter((v) => v !== value) : [...old, value]);
  const applyChosenOptions = async () => {
    if (!onSuggestOptions || !chosenOptions.length || locked) return;
    setApplyingOptions(true); setOptionMessage("");
    try {
      await onSuggestOptions(chosenOptions);
      setChosenOptions([]);
      setOptionMessage(listingId ? "선택한 옵션을 매물에 저장했어요." : "선택한 옵션을 매물 정보에 추가했어요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "옵션을 저장하지 못했어요.");
    } finally { setApplyingOptions(false); }
  };

  return (
    <section className="card photo-guide" aria-label="사진으로 매물 정보 정리하기">
      <div className="photo-guide-heading">
        <div>
          <span className="eyebrow">PHOTO STUDIO</span>
          <h2>사진으로 우리 집 정보 정리하기</h2>
          <p>사진을 선택하고, AI가 찾은 정보를 확인해 매물 등록에 활용하세요.</p>
        </div>
        <span className="photo-guide-count">{items.length}<small>/ 6장</small></span>
      </div>
      <div className="photo-guide-milestones" aria-label="사진 등록 진행 상황">
        <span className={items.length ? "is-done" : ""}><b>01</b> 사진 선택 <small>{items.length}장</small></span>
        <span className={reviewed.length ? "is-done" : ""}><b>02</b> AI 정보 정리 <small>{reviewed.length}장 분석</small></span>
        <span className={publishedIds.length ? "is-done" : ""}><b>03</b> 사진 공개 <small>{listingId ? publishedIds.length + "장 공개" : "매물 저장 후"}</small></span>
      </div>
      <div className="photo-guide-picker">
        <div><strong>사진을 추가해 주세요</strong>
          <p>최대 6장 · JPG, PNG, WebP · 장당 8MB 이하</p>
        </div>
        <label className="btn photo-guide-upload">
          + 사진 추가하기
          <input type="file" aria-label="우리 집 사진 추가" accept="image/jpeg,image/png,image/webp"
            multiple onChange={upload} disabled={locked || items.length >= 6} />
        </label>
      </div>
      <div className="photo-guide-samples-title">
        <strong>사진이 없다면 예시로 먼저 체험하기</strong>
        <span>예시는 실제 매물에 게시할 수 없어요</span>
      </div>
      <div className="photo-guide-sample-list" aria-label="매물 사진 예시">
        {PHOTO_DEMO_ASSETS.map((example) => (
          <button key={example.id} type="button" className="photo-guide-sample"
            aria-label={example.label + " 예시 사진 추가"}
            disabled={locked || items.length >= 6 || items.some((item) => item.name === example.fileName)}
            onClick={() => void loadSyntheticDemo(example)}>
            <img src={example.src} alt="" loading="lazy" />
            <strong>{example.label} 예시</strong>
            <span>{example.hint}</span>
          </button>
        ))}
      </div>
      <div className="photo-guide-permissions" aria-label="사진 AI와 공개 동의">
        <div className="photo-guide-permission">
          <span className="photo-guide-permission-icon" aria-hidden="true">✦</span>
          <div>
            <strong>AI로 공간·옵션 확인</strong>
            <p>동의 후 원하는 사진의 분석 버튼을 눌러 실행합니다. 자동 일괄 호출은 하지 않아요.</p>
            <label className="photo-guide-consent">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>매물 정보 초안 추출을 위해 선택한 사진을 Meta Vision AI로 전송하는 데 동의합니다.</span>
            </label>
            {!available.vision ? <p className="photo-guide-unavailable" role="status">현재 AI 분석이 비활성화되어 있어요. 사진 확인·가리기는 이용할 수 있습니다.</p> : null}
          </div>
        </div>
        <div className="photo-guide-permission">
          <span className="photo-guide-permission-icon" aria-hidden="true">▧</span>
          <div>
            <strong>가구 없는 모습 미리보기 <small>선택 기능</small></strong>
            <p>AI가 가구를 지운 가상 이미지입니다. 실제 구조·하자 정보로 사용하지 마세요.</p>
            <label className="photo-guide-consent">
              <input type="checkbox" checked={editConsent} onChange={e => setEditConsent(e.target.checked)} />
              <span>선택한 사진을 Meta Muse Image로 별도 전송하는 데 동의합니다.</span>
            </label>
            {!available.imageEdit ? <p className="photo-guide-unavailable">현재 이미지 생성 기능이 비활성화되어 있어요.</p> : null}
          </div>
        </div>
      </div>
      {listingId ? <div className="photo-guide-publish-consent">
        <div>
          <strong>매물 사진 공개 확인</strong>
          <p>AI가 가구를 지운 이미지는 공개하지 않습니다. 게시한 사진은 누구나 볼 수 있어요. 사람·문서·주소·반사된 개인정보를 직접 확인해 주세요.</p>
        </div>
        <label className="photo-guide-consent">
          <input type="checkbox" checked={publicationConsent} onChange={e => setPublicationConsent(e.target.checked)} />
          <span>개인정보와 게시 권한을 확인했고, 검토한 게시용 JPEG 사진 공개에 동의합니다.</span>
        </label>
        {publishMessage ? <p role="status" className="photo-guide-publish-message">{publishMessage}</p> : null}
      </div> : <p className="photo-guide-save-note">사진은 아직 저장·게시되지 않았어요. 매물 등록 후 이 화면에서 같은 사진을 검토하고 공개할 수 있습니다.</p>}
      {analysisProgress ? <p className="photo-guide-progress" role="status" aria-live="polite">{analysisProgress}</p> : null}
      <div className="photo-guide-grid">
        {items.map((item) => (
          <article className={"photo-guide-item" + (item.reviewed ? " is-reviewed" : "")} key={item.id}>
            <div className="photo-guide-thumbnail">
              <img src={item.url} alt={"매물 사진 원본 또는 일부 가림 처리본: " + item.name} />
              {item.review ? <span className="photo-guide-room-badge">{PHOTO_ROOM_NAMES[item.review.room]}</span> : null}
            </div>
            <div className="photo-guide-item-text">
              <div className="photo-guide-item-heading">
                <strong>{item.name}</strong>
                <span className={item.reviewed ? "photo-guide-status is-ready" : "photo-guide-status"}>
                  {item.reviewed ? "AI 분석 완료" : "분석 전"}
                </span>
              </div>
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
              <div className="photo-guide-empty-action">
                <button type="button" className="btn photo-guide-primary"
                  disabled={locked || item.reviewed || !consent || !available.vision}
                  onClick={() => void analyzeOne(item)}>
                  {analyzing ? "분석 중..." : item.reviewed ? "이 사진 분석 완료" : "이 사진 AI 분석"}
                </button>
                <button type="button" className="btn ghost"
                  disabled={!editConsent || !available.imageEdit || locked}
                  onClick={() => void previewEmptyRoom(item)}>
                  {editingId === item.id ? "이미지 만드는 중..." : item.emptyPreview ? "가구 없는 모습 다시 만들기" : "가구 없는 모습 미리보기"}
                </button>
              </div>
              <div className="photo-guide-actions">
                <button type="button" className="btn ghost" disabled={locked} onClick={() => { setMaskId(item.id); setMasks([]); }}>
                  개인 물품 가리기
                </button>
                {publishedIds.includes(item.id) && listingId ?
                  <a className="btn ghost" href={"/owner/listings/" + encodeURIComponent(listingId) + "#owner-gallery"}>게시된 사진 관리 →</a> :
                  <button type="button" className="btn ghost" disabled={locked} onClick={() => remove(item.id)}>사진 제거</button>}
                {listingId ? <button type="button" className="btn photo-guide-publish"
                  disabled={locked||!publicationConsent||publishedIds.includes(item.id)||item.name.startsWith("synthetic-demo-")}
                  onClick={()=>void publishPhoto(item)}>
                  {publishingId===item.id?"공개 사진 저장 중...":publishedIds.includes(item.id)?"✓ 게시 완료":"검토한 사진 공개하기"}
                </button>:null}
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

      <details className="photo-guide-privacy">
        <summary>사진 공개 전 개인정보 확인 안내</summary>
        <p>사진 속 사람, 가족 사진, 문서, 주소·택배 라벨, 화면, 거울 반사 등을 직접 확인하고 가려 주세요. AI 분석 결과에 없더라도 개인정보가 없다는 뜻은 아닙니다.</p>
      </details>

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
              {onSuggestOptions?<button type="button" className="btn ghost" disabled={!chosenOptions.length || locked}
                onClick={() => void applyChosenOptions()}>
                {applyingOptions ? "선택 옵션 저장 중..." : listingId ?
                  `선택한 ${chosenOptions.length}개를 실제 매물에 저장` : `선택한 ${chosenOptions.length}개를 매물 옵션 입력란에 추가`}
              </button>:null}
              {optionMessage ? <p className="photo-guide-option-success" role="status">{optionMessage}</p> : null}
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

      <p className="photo-guide-disclaimer">AI는 사진에 보이는 내용만 추정해요. 실제 제공 옵션과 공간 상태는 집주인이 확인해야 합니다. 업로드 원본과 AI 편집 이미지는 서버에 영구 저장하지 않습니다.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {maskId !== null ? <div ref={maskPanelRef} className="photo-guide-mask" role="group" aria-label="사진 개인정보 가리기">
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
