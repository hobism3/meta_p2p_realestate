// DirectHome MVP 테스트. Node 내장 test 러너만 사용.
// 실행: node --test tests/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SEED_LISTINGS,
  filterListings,
  formatPrice,
  EMPTY_FILTERS,
  CHECKLIST_ITEMS,
} from "../lib/listings.ts";

describe("가상 매물 데이터", () => {
  it("15~25건이다", () => {
    assert.ok(SEED_LISTINGS.length >= 15 && SEED_LISTINGS.length <= 25);
  });
  it("전부 합성 표시다", () => {
    for (const l of SEED_LISTINGS) assert.equal(l.synthetic, true);
  });
  it("필수 항목이 비어 있지 않다", () => {
    for (const l of SEED_LISTINGS) {
      assert.ok(l.id && l.title && l.address && l.moveIn && l.publisher);
      assert.ok(l.deposit >= 0 && l.rent >= 0 && l.fee >= 0 && l.area > 0);
      assert.ok(l.lat > 37.47 && l.lat < 37.5 && l.lng > 126.91 && l.lng < 126.94);
    }
  });
  it("id가 유일하다", () => {
    const ids = SEED_LISTINGS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("검색·필터", () => {
  it("키워드 검색이 동작한다", () => {
    const r = filterListings(SEED_LISTINGS, { ...EMPTY_FILTERS, query: "투룸" });
    assert.ok(r.length > 0 && r.length < SEED_LISTINGS.length);
  });
  it("거래유형 필터가 동작한다", () => {
    const r = filterListings(SEED_LISTINGS, { ...EMPTY_FILTERS, tradeType: "전세" });
    assert.ok(r.length > 0 && r.every((l) => l.tradeType === "전세"));
  });
  it("가격·면적 필터가 동작한다", () => {
    const r = filterListings(SEED_LISTINGS, { ...EMPTY_FILTERS, depositMax: 1000, rentMax: 70, areaMin: 23 });
    assert.ok(r.every((l) => l.deposit <= 1000 && l.rent <= 70 && l.area >= 23));
  });
  it("조건이 없으면 전체를 반환한다", () => {
    assert.equal(filterListings(SEED_LISTINGS, EMPTY_FILTERS).length, SEED_LISTINGS.length);
  });
  it("없는 조건은 빈 결과를 낸다", () => {
    const r = filterListings(SEED_LISTINGS, { ...EMPTY_FILTERS, query: "존재하지않는동" });
    assert.equal(r.length, 0);
  });
});

describe("가격 표기", () => {
  it("전세·월세를 구분한다", () => {
    const jeonse = SEED_LISTINGS.find((l) => l.tradeType === "전세");
    const wolse = SEED_LISTINGS.find((l) => l.tradeType === "월세");
    assert.ok(formatPrice(jeonse).startsWith("전세"));
    assert.ok(formatPrice(wolse).includes("/"));
  });
});

describe("체크리스트", () => {
  it("안내 항목이 있다", () => {
    assert.ok(CHECKLIST_ITEMS.length >= 5);
  });
});
