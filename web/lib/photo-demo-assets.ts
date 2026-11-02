/**
 * Demonstration-only Unsplash room photography from credited public example assets.
 * These are unrelated properties. Never prefill ownership, room availability or
 * a legally binding listing fact from this catalogue.
 */
export const PHOTO_DEMO_ASSETS = [
  {
    id: "living",
    label: "거실",
    hint: "의자 · 바닥 · 창문",
    src: "/images/photo-example-living.jpg",
    fileName: "synthetic-demo-living.jpg",
  },
  {
    id: "kitchen",
    label: "주방",
    hint: "냉장고 · 레인지",
    src: "/images/photo-example-kitchen.jpg",
    fileName: "synthetic-demo-kitchen.jpg",
  },
  {
    id: "lounge",
    label: "라운지",
    hint: "소파 · TV · 벽난로",
    src: "/images/photo-example-lounge.jpg",
    fileName: "synthetic-demo-lounge.jpg",
  },
] as const;
