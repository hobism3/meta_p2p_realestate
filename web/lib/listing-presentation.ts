import type { Listing, TradeType } from "./listings.ts";

/**
 * Decorative images are created for the hackathon demo and do NOT depict the address
 * or an actual property. Never describe them as a verified listing photo.
 */
const DEMO_PHOTOS = [
  "/images/demo-living-warm.webp",
  "/images/demo-living-light.webp",
  "/images/demo-living-skyline.webp",
] as const;

export function listingPhoto(listing: Pick<Listing, "id">): string {
  let hash = 0;
  for (const ch of listing.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DEMO_PHOTOS[hash % DEMO_PHOTOS.length];
}

export function listingPhotoAlt(): string {
  return "AI 생성 시연용 인테리어 이미지. 실제 매물 사진이 아닙니다.";
}

export const FEATURE_SUGGESTIONS: Record<TradeType, readonly string[]> = {
  "월세": ["에어컨", "침대", "냉장고", "세탁기", "건조기", "엘리베이터", "주차", "반려동물 가능", "반려동물 불가", "베란다"],
  "전세": ["에어컨", "냉장고", "세탁기", "시스템에어컨", "주차", "엘리베이터", "반려동물 가능", "반려동물 불가", "베란다"],
  "매매": ["시스템에어컨", "확장형", "비확장형", "주차", "엘리베이터", "발코니", "베란다", "에어컨", "세탁기"],
};

const LIFESTYLE_RE = /(반려동물|반려견|강아지|고양이|소형견|애완동물|흡연)/;
const STRUCTURE_RE = /(확장|비확장|발코니|베란다|테라스|복층|남향|방향|방수|주차|엘리베이터)/;

/** Classification affects presentation only; no contract value or source data is mutated. */
export function groupListingFeatures(options: readonly string[]): {
  facilities: string[];
  structure: string[];
  lifestyle: string[];
} {
  const unique = Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)));
  return {
    facilities: unique.filter((x) => !LIFESTYLE_RE.test(x) && !STRUCTURE_RE.test(x)),
    structure: unique.filter((x) => STRUCTURE_RE.test(x)),
    lifestyle: unique.filter((x) => LIFESTYLE_RE.test(x)),
  };
}

export function initialTerms(listing: Pick<Listing, "tradeType" | "salePrice" | "deposit" | "rent">): Array<{ label: string; value: string }> {
  const fmt = (n: number) => `${n.toLocaleString()}만원`;
  if (listing.tradeType === "매매") return [{ label: "등록 매매가", value: fmt(listing.salePrice) }];
  if (listing.tradeType === "전세") return [{ label: "기존 전세보증금", value: fmt(listing.deposit) }];
  return [
    { label: "기존 보증금", value: fmt(listing.deposit) },
    { label: "기존 월세", value: fmt(listing.rent) },
  ];
}
