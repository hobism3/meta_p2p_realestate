import { describe, it } from "node:test";
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
  it("Meta 요청은 구조화 JSON 응답과 inline PDF를 이용한다", () => {
    const q = buildRegistryMetaRequest(makeSampleRegistryPdf());
    assert.equal(q.response_format.json_schema.name, "registry_listing_draft");
    const parts = q.messages[0].content;
    assert.equal(parts[1].type, "file");
    assert.ok(parts[1].file.file_data.startsWith("data:application/pdf;base64,"));
    assert.equal(q.model, "muse-spark-1.3");
    assert.equal(typeof REGISTRY_PROMPT_VERSION, "string");
    assert.doesNotMatch(JSON.stringify(q), /ownerId|residentId/);
  });
});
