// VS-4C 양측 합의 순수 함수 테스트. 네트워크·서버 없이 검증한다.
// 실행: web/에서 `node --test tests/agreement.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bubbleFor, evaluateDemoDecision, isAgreed } from "../lib/agreement-service.ts";

describe("시연 AI 판정", () => {
  it("범위 안 가격은 동의한다", async () => {
    const r = evaluateDemoDecision("매수 희망가", "38,500만원", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human");
    assert.equal(r.decision, "agree");
  });
  it("범위 밖 가격은 거절하고 범위를 밝힌다", async () => {
    const r = evaluateDemoDecision("매수 희망가", "36,000만원", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human");
    assert.equal(r.decision, "refuse");
    assert.ok(r.reason.includes("37,000"));
  });
  it("협의 불가 매물은 정가 미만 거절한다", async () => {
    const r = evaluateDemoDecision("매수 희망가", "900만원", 1000, { kind: "none" }, "human");
    assert.equal(r.decision, "refuse");
    const ok = evaluateDemoDecision("매수 희망가", "1,000만원", 1000, { kind: "none" }, "human");
    assert.equal(ok.decision, "agree");
  });
  it("AI 자신의 제안은 동의한다", async () => {
    const r = evaluateDemoDecision("매도 제안가", "38,500만원", 39000, { kind: "ranged", min: 37000, max: 39000 }, "demo");
    assert.equal(r.decision, "agree");
  });
  it("계약금 10%는 서버 계산값을 그대로 동의한다", async () => {
    const r = evaluateDemoDecision("계약금", "3,850만원", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human");
    assert.equal(r.decision, "agree");
  });
});

describe("양측 동의 판정", () => {
  it("시연방은 사람+AI 동의가 필요하다", async () => {
    assert.equal(isAgreed([{ actor_id: "u1", actor_type: "human", decision: "agree" }], true), false);
    assert.equal(
      isAgreed(
        [
          { actor_id: "u1", actor_type: "human", decision: "agree" },
          { actor_id: "demo:r", actor_type: "demo", decision: "agree" },
        ],
        true,
      ),
      true,
    );
  });
  it("실거래방은 서로 다른 사람 2명이 필요하다", async () => {
    assert.equal(isAgreed([{ actor_id: "u1", actor_type: "human", decision: "agree" }], false), false);
    assert.equal(
      isAgreed(
        [
          { actor_id: "u1", actor_type: "human", decision: "agree" },
          { actor_id: "u2", actor_type: "human", decision: "agree" },
        ],
        false,
      ),
      true,
    );
  });
  it("거절이 있으면 동의가 안 된다", async () => {
    assert.equal(
      isAgreed(
        [
          { actor_id: "u1", actor_type: "human", decision: "agree" },
          { actor_id: "u2", actor_type: "human", decision: "refuse" },
        ],
        false,
      ),
      false,
    );
  });
});

describe("카드 말풍선", () => {
  it("없으면 null이다", async () => {
    assert.equal(bubbleFor([]), null);
  });
});
