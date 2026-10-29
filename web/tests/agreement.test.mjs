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
  it("미정 정책은 수락 발언이 있을 때만 동의한다", async () => {
    const at = "2026-10-29T00:00:00+09:00";
    const wait = evaluateDemoDecision("매수 희망가", "70,000만원", 72000, { kind: "undecided" }, "human", {
      aiTexts: ["7억은 어렵습니다"], aiDated: [{ text: "7억은 어렵습니다", at }], visitDate: "", visitTime: "",
    });
    assert.equal(wait.decision, null);
    const ok = evaluateDemoDecision("매수 희망가", "71,000만원", 72000, { kind: "undecided" }, "human", {
      aiTexts: ["7억1천에 가능합니다"],
      aiDated: [{ text: "7억1천에 가능합니다", at }],
      visitDate: "", visitTime: "",
    });
    assert.equal(ok.decision, "agree");
  });
  it("계약금 10%는 서버 계산값을 그대로 동의한다", async () => {
    const r = evaluateDemoDecision("계약금", "3,850만원", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human");
    assert.equal(r.decision, "agree");
  });
  it("AI가 말한 일정에만 동의한다", async () => {
    const at = "2026-10-29T00:00:00+09:00";
    const ai = ["내일 오후 2시에 가능합니다"];
    const dated = [{ text: "내일 오후 2시에 가능합니다", at }];
    const ok = evaluateDemoDecision("방문일", "10월 30일 오후 2시", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human", {
      aiTexts: ai, aiDated: dated, visitDate: "2026-10-30", visitTime: "14:00",
    });
    assert.equal(ok.decision, "agree");
    const no = evaluateDemoDecision("방문일", "10월 30일 오후 2시", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human", {
      aiTexts: ["내일은 어렵고 11월 1일 오후에 방문하세요"],
      aiDated: [{ text: "내일은 어렵고 11월 1일 오후에 방문하세요", at }],
      visitDate: "2026-10-30", visitTime: "14:00",
    });
    assert.equal(no.decision, "refuse");
    const wait = evaluateDemoDecision("방문일", "10월 31일 오전 10시", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human", {
      aiTexts: ai, aiDated: dated, visitDate: "2026-10-31", visitTime: "10:00",
    });
    assert.equal(wait.decision, null, "증거 없으면 대기한다");
  });
  it("AI가 말하지 않은 날짜는 대기한다", async () => {
    const r = evaluateDemoDecision("입주일", "2027년 2월", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human", {
      aiTexts: ["입주는 협의 가능합니다"], visitDate: "", visitTime: "",
    });
    assert.equal(r.decision, null);
    const ok = evaluateDemoDecision("입주일", "2027년 2월", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human", {
      aiTexts: ["입주는 내년 2월에 가능합니다"], visitDate: "", visitTime: "",
    });
    assert.equal(ok.decision, "agree");
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
  it("실거래방은 매수·매도 역할 각 1명이 필요하다", async () => {
    assert.equal(isAgreed([{ actor_id: "u1", actor_type: "human", decision: "agree" }], false, { u1: "tenant" }), false);
    assert.equal(
      isAgreed(
        [
          { actor_id: "u1", actor_type: "human", decision: "agree" },
          { actor_id: "u2", actor_type: "human", decision: "agree" },
        ],
        false,
        { u1: "tenant", u2: "landlord" },
      ),
      true,
    );
    assert.equal(
      isAgreed(
        [
          { actor_id: "u1", actor_type: "human", decision: "agree" },
          { actor_id: "u3", actor_type: "human", decision: "agree" },
        ],
        false,
        { u1: "tenant", u3: "tenant" },
      ),
      false,
      "같은 역할 2명으로는 확정되면 안 된다",
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
