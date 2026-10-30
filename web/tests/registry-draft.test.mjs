import { describe, it } from "node:test";
import { registryDraftTitle } from "../lib/registry-title.ts";
import assert from "node:assert/strict";
import { 
  REGISTRY_MAX_PDF_BYTES, REGISTRY_SCHEMA, REGISTRY_PROMPT_VERSION,
  buildRegistryMetaRequest, isPlausiblePdf, makeSampleRegistryPdf,
  mockRegistryDraft, validateRegistryDraft,
} from "../lib/registry-draft.ts";

const pair = (value, evidence) => ({ value, evidence });
const data = () => ({
  documentKind: "registry",
  address: pair("서울 관악구 신림로 100 (가상)", "서울 관악구 신림로 100"),
  exclusiveAreaSqm: pair("43.21㎡", "전유부분의 건물의 표시: 43.21㎡"),
  buildingType: pair("집합건물", "건물의 종류: 집합건물"),
  floor: pair("3", "제3층"),
  unit: pair("301", "제301호"),
});

describe("등기 문서 AI 등록 초안", () => {
  it("전유부분 추출값으로 올바른 건물명·동·호 제목을 만든다", () => {
    const korean = {
      buildingName: pair("당당아파트", "당당아파트"),
      buildingType: pair("아파트", "아파트"),
      buildingDong: pair("105", "제105동"),
      floor: pair("5", "제5층 제501호"),
      unit: pair("501", "제5층 제501호"),
    };
    assert.equal(registryDraftTitle(korean), "당당아파트 105동 501호 (확인 필요)");
    const withoutUnit = { ...korean, unit: pair("", "") };
    assert.equal(registryDraftTitle(withoutUnit), "당당아파트 105동 5층 (확인 필요)");
    const leadingZero = { ...korean, unit: pair("0501", "제0501호") };
    assert.equal(registryDraftTitle(leadingZero), "당당아파트 105동 0501호 (확인 필요)");
  });
  it("식별할 수 없는 층·호는 제목에 포함하지 않는다", () => {
    const invalid = {
      buildingName: pair("", ""),
      buildingType: pair("집합건물", "건물 종류"),
      buildingDong: pair("12A", "제12A동"),
      floor: pair("지하1", "지하1층"),
      unit: pair("?", ""),
    };
    assert.equal(registryDraftTitle(invalid), "집합건물 (확인 필요)");
  });
  it("가상 PDF는 구조가 유효하며 실제 등기라고 주장하지 않는다", () => {
    const pdf = makeSampleRegistryPdf();
    assert.equal(isPlausiblePdf(pdf), true);
    assert.ok(pdf.subarray(0, 5).toString().startsWith("%PDF-"));
    assert.ok(pdf.toString("ascii").includes("FICTIONAL PROPERTY RECORD"));
    assert.ok(pdf.toString("ascii").includes("NOT AN OFFICIAL"));
    const draft = mockRegistryDraft(pdf);
    assert.equal(draft?.address.value, "100 Sillim-ro, Gwanak-gu, Seoul (synthetic)");
    assert.equal(draft?.exclusiveAreaSqm.value, "43.21");
    assert.ok(draft?.cautions.some(x => x.includes("직접 입력")));
  });
  it("Mock은 임의 PDF를 분석한 척하지 않는다", () => {
    const altered = Buffer.from(makeSampleRegistryPdf());
    altered[100] ^= 1;
    assert.equal(mockRegistryDraft(altered), null);
  });
  it("전유부분 면적만 등록 면적으로 허용한다", () => {
    const valid = validateRegistryDraft(data());
    assert.equal(valid?.exclusiveAreaSqm.value, "43.21");
    const bad = data();
    bad.exclusiveAreaSqm.evidence = "대지권 면적: 43.21㎡";
    assert.equal(validateRegistryDraft(bad)?.exclusiveAreaSqm.value, "");
    const gross = data();
    gross.exclusiveAreaSqm.evidence = "연면적: 43.21㎡";
    assert.equal(validateRegistryDraft(gross)?.exclusiveAreaSqm.value, "");
  });
  it("근거 없는 입력, 개인정보, 다른 문서유형은 자동 적용하지 않는다", () => {
    const missing = data();
    missing.address.evidence = "";
    assert.equal(validateRegistryDraft(missing)?.address.value, "");
    const pii = data();
    pii.address.evidence = "소유자 김길동 서울 관악구 신림로 100";
    assert.equal(validateRegistryDraft(pii)?.address.value, "");
    const unknown = data();
    unknown.documentKind = "unknown";
    assert.equal(validateRegistryDraft(unknown)?.address.value, "");
    assert.equal(validateRegistryDraft(unknown)?.exclusiveAreaSqm.value, "");
  });
  it("0 또는 비정상 면적을 거부한다", () => {
    const bad = data();
    bad.exclusiveAreaSqm.value = "100000";
    assert.equal(validateRegistryDraft(bad)?.exclusiveAreaSqm.value, "");
    bad.exclusiveAreaSqm.value = "-1";
    assert.equal(validateRegistryDraft(bad)?.exclusiveAreaSqm.value, "");
    bad.exclusiveAreaSqm.value = "0";
    assert.equal(validateRegistryDraft(bad)?.exclusiveAreaSqm.value, "");
  });
  it("PDF 서명과 EOF를 검증한다", () => {
    assert.equal(isPlausiblePdf(Buffer.from("not a pdf")), false);
    assert.equal(isPlausiblePdf(Buffer.alloc(REGISTRY_MAX_PDF_BYTES + 1)), false);
    const encrypted = Buffer.concat([makeSampleRegistryPdf(), Buffer.from("/Encrypt")]);
    assert.equal(isPlausiblePdf(encrypted), false);
  });
  it("실제 업로드된 한국어 가상 등기부의 예상 구조: 동·층·호·전유면적을 구별한다", () => {
    // Derived from a user-provided FICTIONAL document; original PDF and owner fields
    // are intentionally NOT committed or copied into the public repository.
    const proposed = {
      documentKind: "registry",
      address: pair("서울특별시 가상구 샘플로 10길 101", "[집합건물] 서울특별시 가상구 샘플로 10길 101, 당당아파트 제105동 제5층 제501호"),
      exclusiveAreaSqm: pair("59.84", "(전유부분의 건물의 표시) / 주거용 59.84㎡"),
      buildingType: pair("아파트", "12층 아파트"),
      buildingName: pair("당당아파트", "당당아파트 제105동"),
      buildingDong: pair("105", "당당아파트 제105동"),
      floor: pair("5", "제5층 제501호"),
      unit: pair("501", "제5층 제501호"),
      // historical recorded transaction prices are NEVER used as asking prices
      salePrice: "500000000",
    };
    const draft = validateRegistryDraft(proposed);
    assert.equal(draft?.address.value, "서울특별시 가상구 샘플로 10길 101");
    assert.equal(draft?.buildingName.value, "당당아파트");
    assert.equal(draft?.buildingDong.value, "105");
    assert.equal(draft?.floor.value, "5");
    assert.equal(draft?.unit.value, "501");
    assert.equal(draft?.exclusiveAreaSqm.value, "59.84");
    assert.equal("salePrice" in draft, false);
  });
  it("전유부분 헤더가 있어도 근거에 다른 면적만 있으면 빈 값이 된다", () => {
    const wrongFloor = data();
    wrongFloor.exclusiveAreaSqm = pair("425.30", "(1동의 건물의 표시) / 1층 425.30㎡");
    assert.equal(validateRegistryDraft(wrongFloor)?.exclusiveAreaSqm.value, "");
    const wrongLand = data();
    wrongLand.exclusiveAreaSqm = pair("5432.10", "(대지권의 목적인 토지의 표시) / 면적 5,432.10㎡");
    assert.equal(validateRegistryDraft(wrongLand)?.exclusiveAreaSqm.value, "");
    const mismatched = data();
    mismatched.exclusiveAreaSqm = pair("425.30", "(전유부분의 건물의 표시) / 주거용 59.84㎡");
    assert.equal(validateRegistryDraft(mismatched)?.exclusiveAreaSqm.value, "");
    const realUnit = data();
    realUnit.exclusiveAreaSqm = pair("59.84", "(전유부분의 건물의 표시) / 주거용 59.84㎡");
    assert.equal(validateRegistryDraft(realUnit)?.exclusiveAreaSqm.value, "59.84");
  });
  it("등기부 전체 층수 12층과 해당 호실 5층을 혼동하지 않는다", () => {
    const wrong = {
      ...data(),
      buildingName: pair("당당아파트", "당당아파트 제105동"),
      buildingDong: pair("105", "당당아파트 제105동"),
      floor: pair("12", "12층 아파트"),
      unit: pair("501", "제5층 제501호"),
    };
    assert.equal(validateRegistryDraft(wrong)?.buildingDong.value, "105");
    assert.equal(validateRegistryDraft(wrong)?.buildingName.value, "당당아파트");
    assert.equal(validateRegistryDraft(wrong)?.floor.value, "", "12층은 건물 전체 층수로 호실 층수가 아니다");
    assert.equal(validateRegistryDraft(wrong)?.unit.value, "501");
    const correct = { ...wrong, floor: pair("5", "제5층 제501호") };
    assert.equal(validateRegistryDraft(correct)?.floor.value, "5");
    const mismatchedDong = { ...correct, buildingDong: pair("101", "당당아파트 제105동") };
    assert.equal(validateRegistryDraft(mismatchedDong)?.buildingDong.value, "");
  });
  it("영문 가상 PDF의 Floor와 Unit number 근거도 유효하다", () => {
    const sample = mockRegistryDraft(makeSampleRegistryPdf());
    assert.equal(sample?.floor.value, "3");
    assert.equal(sample?.unit.value, "301");
    assert.equal(sample?.exclusiveAreaSqm.value, "43.21");
  });
  it("Meta 요청은 구조화 JSON 응답과 inline PDF를 이용한다", () => {
    const q = buildRegistryMetaRequest(makeSampleRegistryPdf());
    assert.equal(q.response_format.json_schema.name, "registry_listing_draft");
    assert.ok(q.response_format.json_schema.schema.required.includes("buildingName"));
    assert.ok(q.response_format.json_schema.schema.required.includes("buildingDong"));
    const parts = q.messages[0].content;
    assert.equal(parts[1].type, "file");
    assert.ok(parts[1].file.file_data.startsWith("data:application/pdf;base64,"));
    assert.equal(q.model, "muse-spark-1.3");
    assert.equal(typeof REGISTRY_PROMPT_VERSION, "string");
    assert.doesNotMatch(JSON.stringify(q), /ownerId|residentId/);
  });
});
