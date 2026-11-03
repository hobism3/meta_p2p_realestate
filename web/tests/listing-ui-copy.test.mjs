import test from "node:test";
import assert from "node:assert/strict";
import {
  LISTING_FEATURE_EN, featureInputDisplay, featureInputCanonical, listingFeatureLabel,
  tradeTypeLabel, englishListingPrice, wonFromManwon, listingUiMessage, PHOTO_PRIVACY_EN,
} from "../lib/listing-ui-copy.ts";
import { FEATURE_SUGGESTIONS } from "../lib/listing-presentation.ts";
import { PHOTO_FEATURES, PHOTO_PRIVACY_FLAGS } from "../lib/photo-guide.ts";

test("English price display converts ten-thousand-won storage units exactly", () => {
  const form = {tradeType:"월세", deposit:"3000", rent:"68", salePrice:"0"};
  assert.equal(englishListingPrice(form), "Deposit ₩30,000,000 / ₩680,000 per month");
  assert.equal(englishListingPrice({...form, tradeType:"전세"}), "Jeonse deposit ₩30,000,000");
  assert.equal(englishListingPrice({...form, tradeType:"매매", salePrice:"85000"}), "Sale ₩850,000,000");
  assert.equal(wonFromManwon("8.5"), "₩85,000");
  assert.equal(wonFromManwon("0"), "₩0");
  assert.equal(wonFromManwon(""), "—");
  assert.equal(wonFromManwon("invalid"), "—");
  assert.equal(form.deposit, "3000");
});

test("amenity input translation round-trips canonical Korean and custom text", () => {
  const original = "에어컨,  시스템에어컨, custom USB charger, 사용자가 적은 내용 ";
  const shown = featureInputDisplay(original, true);
  assert.equal(shown, "Air conditioner,  Built-in A/C, custom USB charger, 사용자가 적은 내용 ");
  assert.equal(featureInputCanonical(shown, true), original);
  assert.equal(featureInputCanonical("air conditioner, Refrigerator, Custom", true), "에어컨, 냉장고, Custom");
  assert.equal(featureInputDisplay(original, false), original);
  assert.equal(featureInputCanonical(original, false), original);
  assert.equal(featureInputCanonical("Air conditioner in bedroom", true), "Air conditioner in bedroom");
});

test("all selectable feature and privacy enums have English presentation labels", () => {
  for (const value of new Set([...Object.values(FEATURE_SUGGESTIONS).flat(), ...PHOTO_FEATURES])) {
    assert.ok(LISTING_FEATURE_EN[value], value);
    assert.doesNotMatch(listingFeatureLabel(value, true), /[가-힣]/);
    assert.equal(listingFeatureLabel(value, false), value);
  }
  for (const value of PHOTO_PRIVACY_FLAGS) assert.ok(PHOTO_PRIVACY_EN[value]);
  assert.equal(tradeTypeLabel("월세", true), "Monthly rent");
  assert.equal(tradeTypeLabel("월세", false), "월세");
});

test("status translation preserves file names and no-automatic-retry meaning", () => {
  assert.equal(listingUiMessage("사진 AI 분석 중: living room.jpg", true), "Analyzing photo with AI: living room.jpg");
  assert.equal(listingUiMessage("room.jpg: 사진 분석 실패 · 자동 재시도하지 않아요.", true), "room.jpg: Photo analysis failed. · No automatic retry.");
  assert.equal(listingUiMessage("선택한 옵션을 매물 정보에 추가했어요.", true), "Selected amenities added to the listing draft.");
  assert.equal(listingUiMessage("보증금을 숫자로 입력해 주세요.", true), "Enter a numeric deposit amount.");
  assert.equal(listingUiMessage("서버의 원문 상세", true), "서버의 원문 상세");
  assert.equal(listingUiMessage("사진 분석 실패", false), "사진 분석 실패");
});
