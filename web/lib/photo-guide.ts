/**
 * 매물 사진 가이드의 결정적 검증 계층.
 * LLM은 공간/시설/노출 후보만 제안한다. 게시 옵션·공간 구조·계약 사실을 확정하지 않는다.
 * 사진 픽셀·개인 정보는 이 모듈에서 저장하지 않는다.
 */
export const PHOTO_ROOMS = ["living_room", "bedroom", "kitchen", "bathroom", "entrance", "balcony", "other", "unknown"] as const;
export type PhotoRoom = (typeof PHOTO_ROOMS)[number];
export const PHOTO_ROOM_NAMES: Record<PhotoRoom, string> = {
  living_room: "거실", bedroom: "침실", kitchen: "주방", bathroom: "욕실",
  entrance: "현관", balcony: "발코니", other: "기타 공간", unknown: "분류 불확실",
};

export const PHOTO_FEATURES = [
  "에어컨", "시스템에어컨", "냉장고", "세탁기", "건조기", "침대",
  "옷장", "인덕션", "가스레인지", "전자레인지", "비데", "싱크대",
] as const;

export const PHOTO_PRIVACY_FLAGS = [
  "person", "face", "photo_frame", "document", "screen", "address_label", "reflection",
] as const;
export type PhotoPrivacyFlag = (typeof PHOTO_PRIVACY_FLAGS)[number];
export const PHOTO_PRIVACY_LABELS: Record<PhotoPrivacyFlag, string> = {
  person: "사람", face: "얼굴", photo_frame: "인물 사진·액자",
  document: "개인 문서", screen: "화면", address_label: "주소·택배 라벨",
  reflection: "거울·유리 반사",
};

export interface PhotoReview {
  room: PhotoRoom;
  features: string[];
  privacyFlags: PhotoPrivacyFlag[];
}

function dedupeAllowlist<T extends string>(value: unknown, allowlist: readonly T[], max: number): T[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(allowlist);
  const output: T[] = [];
  for (const entry of value.slice(0, 35)) {
    if (typeof entry === "string" && allowed.has(entry) && !output.includes(entry as T)) output.push(entry as T);
    if (output.length >= max) break;
  }
  return output;
}

/** Model raw output is never echoed: names, OCR, addresses, free text are discarded. */
export function sanitizePhotoReview(value: unknown): PhotoReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.room !== "string" || !PHOTO_ROOMS.includes(v.room as PhotoRoom)) return null;
  return {
    room: v.room as PhotoRoom,
    features: dedupeAllowlist(v.features, PHOTO_FEATURES, 12),
    privacyFlags: dedupeAllowlist(v.privacyFlags, PHOTO_PRIVACY_FLAGS, 7),
  };
}

export function parsePhotoModelText(text: string): PhotoReview | null {
  // A single fenced JSON response is acceptable; any non-JSON text fails closed.
  const trimmed = text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  if (trimmed.length > 7000) return null;
  try { return sanitizePhotoReview(JSON.parse(trimmed)); } catch { return null; }
}

export interface PhotoQualityMetrics {
  width: number;
  height: number;
  brightness: number; // sampled mean, 0..255
  fileBytes: number;
}
export function photoQualityHints(m: PhotoQualityMetrics): string[] {
  const messages: string[] = [];
  if (Math.min(m.width, m.height) < 600) messages.push("해상도가 낮아요. 더 선명한 사진을 권장해요.");
  if (m.brightness < 52) messages.push("전체적으로 어두워 보여요. 조명을 켜고 다시 촬영해 보세요.");
  if (m.brightness > 240) messages.push("전체적으로 너무 밝아요. 노출을 조절해 보세요.");
  if (m.fileBytes < 30 * 1024) messages.push("압축이 강할 수 있어요. 원본 품질을 확인해 주세요.");
  return messages;
}

/** 9x8 sampled perceptual difference hash: 64 bits of "0"/"1". */
export function imageDifferenceHash(pixels: readonly number[]): string {
  if (pixels.length !== 72) throw new RangeError("9x8 grayscale samples required");
  let hash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) hash += pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? "1" : "0";
  }
  return hash;
}
export function nearDuplicateHash(a: string, b: string): boolean {
  if (!/^[01]{64}$/.test(a) || !/^[01]{64}$/.test(b)) return false;
  let differences = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) differences++;
  return differences <= 4;
}

/** AI results are evidence of visibility, never proof that a pictured item is included in a lease. */
export const PHOTO_LISTING_OPTION_CANDIDATES = [
  "에어컨", "시스템에어컨", "냉장고", "세탁기", "건조기", "침대",
  "옷장", "인덕션", "가스레인지", "전자레인지", "비데",
] as const;

export function photoOptionCandidates(reviews: readonly PhotoReview[]): string[] {
  const allowed = new Set<string>(PHOTO_LISTING_OPTION_CANDIDATES);
  return Array.from(new Set(reviews.flatMap((review) => review.features).filter((v) => allowed.has(v))));
}

/**
 * An absence in photos is not an absence in the property. Studio housing may
 * not have distinct bedroom or living room; guide combined coverage instead.
 */
export function recommendedPhotoRooms(reviews: readonly PhotoReview[]): string[] {
  if (!reviews.length) return [];
  const have = new Set(reviews.map((r) => r.room));
  const missing: string[] = [];
  if (!have.has("bathroom")) missing.push("욕실");
  if (!have.has("kitchen")) missing.push("주방");
  if (!have.has("living_room") && !have.has("bedroom")) missing.push("생활 공간(거실·침실)");
  return missing;
}

/** Copy is intentionally conditional. Do not claim a room is absent. */
export function photoCoverageMessages(reviews: readonly PhotoReview[]): string[] {
  return recommendedPhotoRooms(reviews).map((room) =>
    room + " 사진은 아직 확인되지 않았어요. 해당 공간이 있다면 사진을 추가하면 좋아요.");
}
