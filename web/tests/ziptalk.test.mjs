// VS-3A 집톡이 분석 계약 단위 테스트. 네트워크·서버 없이 순수 함수만 검증한다.
// 실행: web/에서 `node --test tests/ziptalk.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeMock, buildZiptalkInput, validateZiptalkOutput } from "../lib/ziptalk-service.ts";

const T = (text, author_type = "human") => ({ id: "m1", author_type, author: "h", text });
const cur = (entries) => new Map(Object.entries(entries));
const price = (value, proposer = "human", status = "proposed") => ({ name: "가격", value, proposer, status });

describe("mock 분석", () => {
  it("첫 가격 제안을 기록하고 개입한다", async () => {
    const r = analyzeMock(T("44000만원에 합시다"), cur({}));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts.length, 1);
    assert.equal(r.upserts[0].value, "44,000만원");
    assert.equal(r.upserts[0].status, "proposed");
    assert.deepEqual(r.upserts[0].evidence, ["m1"]);
    assert.ok(r.bubble && r.bubble.includes("새로 제안됐어요"));
  });
  it("같은 값은 조용하다", async () => {
    const r = analyzeMock(T("44000만원에 합시다"), cur({ 가격: price("44,000만원") }));
    assert.equal(r.intervene, false);
    assert.equal(r.upserts.length, 0);
    assert.equal(r.bubble, null);
  });
  it("변경은 새 값으로 기록한다", async () => {
    const r = analyzeMock(T("44500만원에 합시다"), cur({ 가격: price("44,000만원") }));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].value, "44,500만원");
    assert.ok(r.bubble && r.bubble.includes("변경됐어요"));
  });
  it("철회는 미확인으로 둔다", async () => {
    const r = analyzeMock(T("제안은 취소합니다"), cur({ 가격: price("44,000만원") }));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].status, "unconfirmed");
    assert.equal(r.upserts[0].value, "44,000만원");
  });
  it("입주일 질문은 미확인으로 둔다", async () => {
    const r = analyzeMock(T("입주일은 언제인가요?"), cur({}));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].name, "입주일");
    assert.equal(r.upserts[0].status, "unconfirmed");
    assert.ok(r.bubble && r.bubble.includes("확인되지 않았어요"));
  });
  it("판단은 무시한다", async () => {
    const r = analyzeMock(T("이 집은 최고 등급입니다"), cur({}));
    assert.equal(r.intervene, false);
    assert.equal(r.upserts.length, 0);
  });
  it("확정(confirmed)은 절대 만들지 않는다", async () => {
    const r = analyzeMock(T("44000만원에 합시다"), cur({}));
    assert.ok(r.upserts.every((u) => u.status !== "confirmed"));
  });
});

describe("모델 출력 검증", () => {
  const ids = new Set(["m1", "m2"]);
  it("근거 없는 조건을 버린다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "가격", value: "4억", proposer: "human", status: "proposed", evidence_ids: ["x"] }], intervene: true, bubble: "안내" },
      ids,
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("confirmed를 받지 않는다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "가격", value: "4억", proposer: "human", status: "confirmed", evidence_ids: ["m1"] }], intervene: true, bubble: "안내" },
      ids,
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("형식 오류는 null이다", async () => {
    assert.equal(validateZiptalkOutput(null, ids), null);
    assert.equal(validateZiptalkOutput({ conditions: "x" }, ids), null);
  });
  it("긴 말풍선은 버리고 조건은 살린다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "가격", value: "4억", proposer: "demo", status: "proposed", evidence_ids: ["m2"] }], intervene: true, bubble: "x".repeat(300) },
      ids,
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 1);
    assert.equal(v.bubble, null);
    assert.equal(v.intervene, false);
  });
});

describe("분석 입력 계약", () => {
  it("같은 방 근거 ID와 이전 조건을 담는다", async () => {
    const input = buildZiptalkInput("남향 매매", { 가격: "28,000만원" }, [price("27,000만원", "demo")], [
      { id: "m1", author_type: "human", author: "h", text: "27000에 합시다" },
      { id: "m9", author_type: "assistant", author: "집톡이", text: "정리" },
    ]);
    assert.ok(input.system.includes("28,000만원"));
    assert.ok(input.system.includes("confirmed는 절대 쓰지 마"));
    assert.ok(input.messages[0].content.includes("[m1]"));
    assert.ok(input.messages[1].content.includes("집톡이"));
  });
});
