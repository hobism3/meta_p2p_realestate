import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_REGISTER_DRAFT, firstRegistrationIssue,
  listingPriceLabel, registrationIssue,
} from "../lib/register-wizard.ts";

function valid() {
  return {
    ...EMPTY_REGISTER_DRAFT,
    title: "테스트 집",
    address: "서울 관악구 가상로 1",
    area: "59.84",
    tradeType: "월세",
    deposit: "1000",
    rent: "65",
    moveIn: "즉시 입주",
    publisher: "테스트",
  };
}

describe("단계별 등록 검증", () => {
  it("PDF 없이 시작 단계는 건너뛸 수 있지만 공간 정보 필수값은 검증한다", () => {
    assert.equal(registrationIssue(EMPTY_REGISTER_DRAFT, 0), null);
    assert.equal(registrationIssue(EMPTY_REGISTER_DRAFT, 1)?.field, "title");
    assert.equal(registrationIssue({ ...valid(), address: " " }, 1)?.field, "address");
    assert.equal(registrationIssue({ ...valid(), area: "0" }, 1)?.field, "area");
    assert.equal(registrationIssue({ ...valid(), area: "잘못된 값" }, 1)?.field, "area");
    assert.equal(registrationIssue(valid(), 1), null);
  });
  it("거래유형에 맞는 금액만 요구하고 값의 범위를 검사한다", () => {
    assert.equal(registrationIssue({ ...valid(), deposit: "" }, 2)?.field, "deposit");
    assert.equal(registrationIssue({ ...valid(), rent: "-1" }, 2)?.field, "rent");
    assert.equal(registrationIssue({ ...valid(), tradeType: "전세", rent: "" }, 2), null);
    assert.equal(registrationIssue({ ...valid(), tradeType: "매매", deposit: "", salePrice: "" }, 2)?.field, "salePrice");
    assert.equal(registrationIssue({ ...valid(), tradeType: "매매", salePrice: "85000" }, 2), null);
  });
  it("입주 시기와 게시자명만 필수, 관리비는 선택 사항", () => {
    assert.equal(registrationIssue({ ...valid(), moveIn: "" }, 3)?.field, "moveIn");
    assert.equal(registrationIssue({ ...valid(), publisher: "" }, 3)?.field, "publisher");
    assert.equal(registrationIssue({ ...valid(), fee: "abc" }, 3)?.field, "fee");
    assert.equal(registrationIssue({ ...valid(), fee: "" }, 3), null);
    assert.equal(firstRegistrationIssue(valid()), null);
  });
  it("요약 금액이 거래유형과 만원 단위를 그대로 유지한다", () => {
    assert.equal(listingPriceLabel(valid()), "1,000 / 65만");
    assert.equal(listingPriceLabel({ ...valid(), tradeType: "전세" }), "전세 1,000만");
    assert.equal(listingPriceLabel({ ...valid(), tradeType: "매매", salePrice: "85000" }), "매매 85,000만");
  });
});
