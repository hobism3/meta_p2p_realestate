// VS-4C.3 거래유형별 합의 회귀. 네트워크·서버 없이 순수 함수만 검증한다.
// 실행: web/에서 `node --test tests/rent.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aiAcceptsRentBundle,
  aiRefusesRentBundle,
  diagnoseLegacyProposals,
  extractAllManwon,
  formatJeonseDeposit,
  formatRentBundle,
  formatRentPartial,
  parseJeonseValue,
  parseRentBundleValue,
  parseRentFields,
  rentValueSupported,
  sideLabels,
  FINAL_PRICE_NAME,
  FINALIZABLE,
  HISTORY_ONLY,
  wantHistoryName,
  offerHistoryName,
} from "../lib/rent.ts";
import { analyzeMock, buildZiptalkInput, validateZiptalkOutput } from "../lib/ziptalk-service.ts";
import { bubbleFor, evaluateDemoDecision } from "../lib/agreement-service.ts";

const T = (text, author_type = "human") => ({ id: "m1", author_type, author: "h", text });
const cur = (entries) => new Map(Object.entries(entries));
const evMap = (entries) => new Map(Object.entries(entries));
const AT = "2026-10-29T00:00:00+09:00";

describe("월세 묶음 파서", () => {
  it("스펙 예제를 만원 단위로 읽는다", async () => {
    assert.deepEqual(parseRentFields("보증금 5000으로 올리고 월세 65로"), { deposit: 5000, monthlyRent: 65 });
  });
  it("쉼표·만원 표기를 읽는다", async () => {
    assert.deepEqual(parseRentFields("보증금 5,000만원에 월세 65만원으로 합시다"), { deposit: 5000, monthlyRent: 65 });
  });
  it("억 단위를 읽는다", async () => {
    assert.deepEqual(parseRentFields("보증금 2억에 월세 85로 합시다"), { deposit: 20000, monthlyRent: 85 });
  });
  it("한 값만 있으면 다른 쪽은 null이다", async () => {
    assert.deepEqual(parseRentFields("월세 70으로 해주세요"), { deposit: null, monthlyRent: 70 });
    assert.deepEqual(parseRentFields("안녕하세요"), { deposit: null, monthlyRent: null });
  });
  it("서로 다른 두 금액을 한 가격으로 합치지 않는다", async () => {
    const f = parseRentFields("보증금 5000으로 올리고 월세 65로");
    assert.equal(f.deposit, 5000);
    assert.equal(f.monthlyRent, 65);
    assert.notEqual(f.deposit, f.monthlyRent);
  });
  it("묶음을 왕복한다", async () => {
    assert.equal(formatRentBundle(5000, 65), "보증금 5,000만원/월세 65만원");
    assert.deepEqual(parseRentBundleValue("보증금 5,000만원/월세 65만원"), { deposit: 5000, monthlyRent: 65 });
    assert.equal(parseRentBundleValue("보증금 5,000만원"), null);
    assert.equal(formatRentPartial({ deposit: 5000, monthlyRent: null }), "보증금 5,000만원");
    assert.equal(formatJeonseDeposit(18000), "전세보증금 18,000만원");
    assert.equal(parseJeonseValue("전세보증금 18,000만원"), 18000);
  });
  it("문맥과 함께 검증한다", async () => {
    assert.equal(rentValueSupported("보증금 5,000만원/월세 65만원", "보증금 5000으로 올리고 월세 65로"), true);
    assert.equal(rentValueSupported("보증금 5,000만원/월세 65만원", "5000과 65로 합시다"), false);
  });
  it("본문 금액을 모두 뽑는다", async () => {
    assert.deepEqual(extractAllManwon("3.9억에서 3.85억으로"), [39000, 38500]);
  });
});

describe("유형 이름·라벨", () => {
  it("최종 후보 이름을 구분한다", async () => {
    assert.equal(FINAL_PRICE_NAME["매매"], "최종 매매가");
    assert.equal(FINAL_PRICE_NAME["전세"], "최종 전세보증금");
    assert.equal(FINAL_PRICE_NAME["월세"], "월세 조건");
    assert.equal(wantHistoryName("월세"), "임차 희망 조건");
    assert.equal(offerHistoryName("전세"), "임대 제안 조건");
  });
  it("임대차 라벨에 매수·매도를 쓰지 않는다", async () => {
    assert.deepEqual(sideLabels("월세"), { human: "임차인", demo: "AI 임대인(시연)", owner: "임대인" });
    assert.ok(!sideLabels("월세").demo.includes("매도"));
    assert.ok(!sideLabels("전세").human.includes("매수"));
  });
  it("희망·역제안은 카드 대상이 아니다", async () => {
    for (const n of HISTORY_ONLY) assert.equal(FINALIZABLE.includes(n), false);
    assert.equal(FINALIZABLE.includes("월세 조건"), true);
  });
});

describe("AI 수락 판정", () => {
  const accept = [{ text: "시연용으로 보증금 5,000만원에 월세 65만원에 가능합니다. (미확정, 사람 확인 필요)", at: AT }];
  it("두 값이 모두 일치할 때만 인정한다", async () => {
    assert.equal(aiAcceptsRentBundle(accept, 5000, 65), true);
    assert.equal(aiAcceptsRentBundle(accept, 5000, 70), false);
    assert.equal(aiAcceptsRentBundle(accept, 4000, 65), false);
  });
  it("파싱 실패·모호함은 보류이며 거절이 아니다", async () => {
    assert.equal(aiAcceptsRentBundle([{ text: "가능합니다", at: AT }], 5000, 65), false);
    assert.equal(aiRefusesRentBundle([{ text: "가능합니다", at: AT }], 5000, 65), false);
  });
  it("같은 조건 거절을 구분한다", async () => {
    const refuse = [{ text: "보증금 5,000만원에 월세 65만원은 어렵습니다", at: AT }];
    assert.equal(aiRefusesRentBundle(refuse, 5000, 65), true);
    assert.equal(aiAcceptsRentBundle(refuse, 5000, 65), false);
  });
  it("전세는 보증금만 본다", async () => {
    const a = [{ text: "시연용으로 전세보증금 18,000만원에 가능합니다. (미확정, 사람 확인 필요)", at: AT }];
    assert.equal(aiAcceptsRentBundle(a, 18000, null), true);
    assert.equal(aiAcceptsRentBundle(a, 17000, null), false);
  });
});

describe("시연 AI 판정(임대차)", () => {
  const accept = {
    aiTexts: ["시연용으로 보증금 5,000만원에 월세 65만원에 가능합니다. (미확정, 사람 확인 필요)"],
    aiDated: [{ text: "시연용으로 보증금 5,000만원에 월세 65만원에 가능합니다. (미확정, 사람 확인 필요)", at: AT }],
    visitDate: "",
    visitTime: "",
  };
  it("월세 두 값 수락에만 동의한다", async () => {
    const ok = evaluateDemoDecision("월세 조건", "보증금 5,000만원/월세 65만원", 2000, { kind: "undecided" }, "human", accept, "월세");
    assert.equal(ok.decision, "agree");
    assert.ok(ok.reason.includes("시연 동의"));
  });
  it("한 값만 맞으면 대기한다", async () => {
    const w = evaluateDemoDecision("월세 조건", "보증금 5,000만원/월세 70만원", 2000, { kind: "undecided" }, "human", accept, "월세");
    assert.equal(w.decision, null);
  });
  it("묶음이 아니면 대기한다", async () => {
    const w = evaluateDemoDecision("월세 조건", "보증금 5,000만원", 2000, { kind: "undecided" }, "human", accept, "월세");
    assert.equal(w.decision, null);
  });
  it("범위 밖 보증금은 거절한다", async () => {
    const r = evaluateDemoDecision("월세 조건", "보증금 500만원/월세 65만원", 1000, { kind: "ranged", min: 950, max: 1000 }, "human", accept, "월세");
    assert.equal(r.decision, "refuse");
  });
  it("전세는 수락 근거가 있어야 동의한다", async () => {
    const a = {
      aiTexts: ["시연용으로 전세보증금 18,000만원에 가능합니다. (미확정, 사람 확인 필요)"],
      aiDated: [{ text: "시연용으로 전세보증금 18,000만원에 가능합니다. (미확정, 사람 확인 필요)", at: AT }],
      visitDate: "",
      visitTime: "",
    };
    const ok = evaluateDemoDecision("최종 전세보증금", "전세보증금 18,000만원", 18000, { kind: "ranged", min: 17500, max: 18000 }, "human", a, "전세");
    assert.equal(ok.decision, "agree");
    const wait = evaluateDemoDecision("최종 전세보증금", "전세보증금 18,000만원", 18000, { kind: "ranged", min: 17500, max: 18000 }, "human", { aiTexts: [], aiDated: [], visitDate: "", visitTime: "" }, "전세");
    assert.equal(wait.decision, null);
  });
  it("매매 최종가는 범위 안에 동의한다", async () => {
    const r = evaluateDemoDecision("최종 매매가", "38,500만원", 39000, { kind: "ranged", min: 37000, max: 39000 }, "human");
    assert.equal(r.decision, "agree");
  });
  it("카드 문구는 묶음 질문이다", async () => {
    const s = bubbleFor([{ name: "월세 조건", value: "보증금 5,000만원/월세 65만원", demoDecision: "agree" }], "월세");
    assert.ok(s && s.includes("보증금 5,000만원/월세 65만원 조건에 동의할까요?"));
  });
});

describe("s02 골든 회귀(단위)", () => {
  it("사람 제안은 이력에만 남고 카드를 만들지 않는다", async () => {
    const r = analyzeMock(T("보증금 5000으로 올리고 월세 65로"), cur({}), AT, [], "월세");
    assert.equal(r.intervene, true);
    assert.equal(r.upserts.filter((u) => u.name === "임차 희망 조건").length, 1);
    assert.equal(r.upserts[0].value, "보증금 5,000만원/월세 65만원");
    assert.ok(!r.upserts.some((u) => u.name === "월세 조건"));
    assert.ok(!r.upserts.some((u) => u.name === "매수 희망가" || u.name === "매도 제안가"));
  });
  it("AI가 두 값을 수락하면 최종 후보 1건만 생긴다", async () => {
    const r = analyzeMock(
      T("시연용으로 보증금 5,000만원에 월세 65만원에 가능합니다. (미확정, 사람 확인 필요)", "demo_agent"),
      cur({ "임차 희망 조건": { name: "임차 희망 조건", value: "보증금 5,000만원/월세 65만원", proposer: "human", status: "proposed" } }),
      AT,
      [{ id: "h1", text: "보증금 5000으로 올리고 월세 65로", author_type: "human" }],
      "월세",
    );
    const finals = r.upserts.filter((u) => u.name === "월세 조건");
    assert.equal(finals.length, 1);
    assert.equal(finals[0].value, "보증금 5,000만원/월세 65만원");
    assert.deepEqual(finals[0].evidence, ["m1", "h1"]);
  });
  it("한 값만 바뀌면 새 묶음으로 이력에 남고 후보는 그대로다", async () => {
    const r = analyzeMock(
      T("월세 70으로 해주세요"),
      cur({
        "임차 희망 조건": { name: "임차 희망 조건", value: "보증금 5,000만원/월세 65만원", proposer: "human", status: "proposed" },
        "월세 조건": { name: "월세 조건", value: "보증금 5,000만원/월세 65만원", proposer: "human", status: "proposed" },
      }),
      AT,
      [],
      "월세",
    );
    const want = r.upserts.find((u) => u.name === "임차 희망 조건");
    assert.equal(want.value, "보증금 5,000만원/월세 70만원");
    assert.ok(!r.upserts.some((u) => u.name === "월세 조건" && u.value !== "보증금 5,000만원/월세 65만원"));
  });
  it("철회는 자기 이력만 미확인으로 둔다", async () => {
    const r = analyzeMock(
      T("제안은 취소합니다"),
      cur({ "임차 희망 조건": { name: "임차 희망 조건", value: "보증금 5,000만원/월세 65만원", proposer: "human", status: "proposed" } }),
      AT,
      [],
      "월세",
    );
    assert.equal(r.upserts[0].name, "임차 희망 조건");
    assert.equal(r.upserts[0].status, "unconfirmed");
  });
});

describe("모델 출력 검증(유형 분리)", () => {
  const leaseEv = evMap({
    m1: { author_type: "human", text: "보증금 5000으로 올리고 월세 65로" },
    m2: { author_type: "demo_agent", text: "시연용으로 보증금 5,000만원에 월세 65만원에 가능합니다. (미확정, 사람 확인 필요)" },
  });
  it("잘못된 매수 희망가 5000을 거부한다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "매수 희망가", value: "5,000만원", proposer: "human", status: "proposed", evidence_ids: ["m1"] }], intervene: true, bubble: "안내" },
      leaseEv,
      "월세",
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("잘못된 매도 제안가 65를 거부한다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "매도 제안가", value: "65만원", proposer: "demo", status: "proposed", evidence_ids: ["m2"] }], intervene: true, bubble: "안내" },
      leaseEv,
      "월세",
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("묶음은 두 값 문맥이 맞을 때만 살린다", async () => {
    const ok = validateZiptalkOutput(
      { conditions: [{ name: "월세 조건", value: "보증금 5,000만원/월세 65만원", proposer: "demo", status: "proposed", evidence_ids: ["m2"] }], intervene: true, bubble: "안내" },
      leaseEv,
      "월세",
    );
    assert.ok(ok);
    assert.equal(ok.conditions.length, 1);
    const half = validateZiptalkOutput(
      { conditions: [{ name: "월세 조건", value: "보증금 5,000만원", proposer: "demo", status: "proposed", evidence_ids: ["m2"] }], intervene: true, bubble: "안내" },
      leaseEv,
      "월세",
    );
    assert.ok(half);
    assert.equal(half.conditions.length, 0);
  });
  it("서로 다른 두 금액을 매매가격으로 해석하지 않는다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "최종 매매가", value: "38,500만원", proposer: "human", status: "proposed", evidence_ids: ["m1"] }], intervene: true, bubble: "안내" },
      evMap({ m1: { author_type: "human", text: "3.9억에서 3.85억으로 합시다" } }),
      "매매",
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("임대차 프롬프트는 매수·매도 표현을 금지한다", async () => {
    const input = buildZiptalkInput("조용한 주택가 투룸", { 보증금: "2,000만원", 월세: "85만원" }, [], [
      { id: "m1", author_type: "human", author: "h", text: "보증금 5000으로 올리고 월세 65로" },
    ], "월세");
    assert.ok(input.system.includes("매수 희망가") === false || input.system.includes("쓰지 마"));
    assert.ok(input.system.includes("월세 조건"));
    assert.ok(input.system.includes("두 값"));
    const sale = buildZiptalkInput("매매", { 가격: "45,000만원" }, [], [], "매매");
    assert.ok(sale.system.includes("최종 매매가"));
  });
});

describe("기존 기록 읽기 전용 진단", () => {
  it("임대차 매수·매도 이름과 비묶음 카드를 보고한다", async () => {
    const d = diagnoseLegacyProposals([
      { room_id: "r1", name: "매수 희망가", value: "5,000만원", status: "refused", trade_type: "월세" },
      { room_id: "r1", name: "월세 조건", value: "5,000만원", status: "proposed", trade_type: "월세" },
      { room_id: "r2", name: "최종 매매가", value: "38,500만원", status: "agreed", trade_type: "매매" },
    ]);
    assert.equal(d.total, 3);
    assert.equal(d.leaseSaleNames.length, 1);
    assert.equal(d.monthlyNonBundle.length, 1);
  });
});
