import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SEED_LISTINGS } from "../lib/listings.ts";
import { FEATURE_SUGGESTIONS, groupListingFeatures, initialTerms, listingPhoto } from "../lib/listing-presentation.ts";

describe("거래유형별 매물 표시", () => {
  it("월세는 보증금과 월세를 분리하고 최초가라고 쓰지 않는다", () => {
    const rent = SEED_LISTINGS.find(x => x.id === "s02");
    assert.deepEqual(initialTerms(rent), [
      { label: "기존 보증금", value: "2,000만원" },
      { label: "기존 월세", value: "85만원" },
    ]);
  });
  it("매매와 전세는 서로 다른 기준 가격을 표시한다", () => {
    const sale = SEED_LISTINGS.find(x => x.id === "s23");
    const jeonse = SEED_LISTINGS.find(x => x.id === "s04");
    assert.deepEqual(initialTerms(sale), [{ label: "등록 매매가", value: "72,000만원" }]);
    assert.deepEqual(initialTerms(jeonse), [{ label: "기존 전세보증금", value: "18,000만원" }]);
  });
  it("반려동물은 생활 조건, 시스템에어컨과 확장은 설비·공간", () => {
    const rent = SEED_LISTINGS.find(x => x.id === "s09");
    const sale = SEED_LISTINGS.find(x => x.id === "s23");
    assert.ok(groupListingFeatures(rent.options).lifestyle.includes("반려동물 가능"));
    assert.ok(groupListingFeatures(sale.options).facilities.includes("시스템에어컨"));
    assert.ok(groupListingFeatures(sale.options).structure.includes("확장형"));
    assert.ok(FEATURE_SUGGESTIONS["월세"].includes("침대"));
    assert.ok(FEATURE_SUGGESTIONS["매매"].includes("비확장형"));
  });
  it("생성 이미지 경로는 공개 정적 자원으로 결정된다", () => {
    for(const l of SEED_LISTINGS) assert.match(listingPhoto(l), /^\/images\/demo-living-.*\.webp$/);
  });
});
