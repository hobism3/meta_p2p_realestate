// VS-3A 집톡이 분석 계약 + VS-3B 의미 검증 단위 테스트. 네트워크·서버 없이 순수 함수만 검증한다.
// 실행: web/에서 `node --test tests/ziptalk.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeMock, buildZiptalkInput, depositAmount, normalizeValue, validateZiptalkOutput } from "../lib/ziptalk-service.ts";

const T = (text, author_type = "human") => ({ id: "m1", author_type, author: "h", text });
const cur = (entries) => new Map(Object.entries(entries));
const wish = (value, proposer = "human", status = "proposed") => ({ name: "매수 희망가", value, proposer, status });
const evMap = (entries) => new Map(Object.entries(entries));

describe("mock 분석", () => {
  it("첫 가격 제안을 매수 희망가로 기록하고 개입한다", async () => {
    const r = analyzeMock(T("44000만원에 합시다"), cur({}));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts.length, 1);
    assert.equal(r.upserts[0].name, "매수 희망가");
    assert.equal(r.upserts[0].value, "44,000만원");
    assert.equal(r.upserts[0].status, "proposed");
    assert.deepEqual(r.upserts[0].evidence, ["m1"]);
    assert.ok(r.bubble && r.bubble.includes("새로 제안됐어요"));
  });
  it("매도자 제안은 매도 제안가로 따로 둔다", async () => {
    const r = analyzeMock(T("44000만원에 합시다", "demo_agent"), cur({}));
    assert.equal(r.upserts[0].name, "매도 제안가");
    assert.equal(r.upserts[0].proposer, "demo");
  });
  it("AI 수락 뒤 사람 질문은 상태를 답하고 최종 후보를 올린다", async () => {
    // 양측이 맞춘 값은 질문 트리거에서도 최종 후보 1건이 된다. 희망 재안내는 하지 않는다.
    const r = analyzeMock(T("매매가 얼마인가요?"), cur({
      "매수 희망가": wish("44,500만원"),
      "매도 제안가": { name: "매도 제안가", value: "44,500만원", proposer: "demo", status: "proposed" },
    }), "", [
      { id: "h1", text: "44500만원에 합시다", author_type: "human" },
      { id: "a1", text: "시연용으로 가격 44500만원에 가능합니다. (미확정, 사람 확인 필요)", author_type: "demo_agent" },
    ]);
    const finals = r.upserts.filter((u) => u.name === "최종 매매가");
    assert.equal(finals.length, 1);
    assert.equal(finals[0].value, "44,500만원");
    assert.ok(!r.upserts.some((u) => u.name === "매수 희망가" || u.name === "매도 제안가"));
    assert.ok(r.bubble && r.bubble.includes("매수 희망가는 44,500만원"));
    assert.ok(r.bubble && !r.bubble.includes("새로 제안됐어요"));
  });
  it("같은 값은 조용하다", async () => {
    const r = analyzeMock(T("44000만원에 합시다"), cur({ "매수 희망가": wish("44,000만원") }));
    assert.equal(r.intervene, false);
    assert.equal(r.upserts.length, 0);
    assert.equal(r.bubble, null);
  });
  it("변경은 새 값으로 기록한다", async () => {
    const r = analyzeMock(T("44500만원에 합시다"), cur({ "매수 희망가": wish("44,000만원") }));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].value, "44,500만원");
    assert.ok(r.bubble && r.bubble.includes("변경됐어요"));
  });
  it("철회는 자기 조건만 미확인으로 둔다", async () => {
    const r = analyzeMock(T("제안은 취소합니다"), cur({ "매수 희망가": wish("44,000만원") }));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].name, "매수 희망가");
    assert.equal(r.upserts[0].status, "unconfirmed");
    assert.equal(r.upserts[0].value, "44,000만원");
  });
  it("상대 조건은 철회하지 않는다", async () => {
    const r = analyzeMock(T("제안은 취소합니다"), cur({ "매도 제안가": wish("44,000만원", "demo") }));
    assert.equal(r.intervene, false);
  });
  it("입주일 질문은 미확인으로 둔다", async () => {
    const r = analyzeMock(T("입주일은 언제인가요?"), cur({}));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].name, "입주일");
    assert.equal(r.upserts[0].status, "unconfirmed");
    assert.ok(r.bubble && r.bubble.includes("확인되지 않았어요"));
  });
  it("방문 질문은 방문일 미확인으로 둔다", async () => {
    const r = analyzeMock(T("방문은 언제 되나요?"), cur({}));
    assert.equal(r.upserts[0].name, "방문일");
    assert.equal(r.upserts[0].status, "unconfirmed");
  });
  it("가격 질문은 조건을 만들지 않고 안내만 한다", async () => {
    const r = analyzeMock(T("매매가 얼마인가요?"), cur({}));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts.length, 0);
    assert.ok(r.bubble && r.bubble.includes("확인되지 않았어요"));
  });
  it("아는 가격은 직접 답해준다", async () => {
    const r = analyzeMock(T("매매가 얼마인가요?"), cur({
      "최초가": { name: "최초가", value: "45,000만원", proposer: "demo", status: "proposed" },
      "매수 희망가": wish("26,000만원"),
    }));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts.length, 0);
    assert.ok(r.bubble && r.bubble.includes("매수 희망가는 26,000만원"));
    assert.ok(r.bubble && !r.bubble.includes("확인"));
  });
  it("아는 일정은 직접 답해준다", async () => {
    const r = analyzeMock(T("방문은 언제 되나요?"), cur({
      "방문일": { name: "방문일", value: "내일", proposer: "demo", status: "proposed" },
    }));
    assert.equal(r.intervene, true);
    assert.equal(r.upserts.length, 0);
    assert.ok(r.bubble && r.bubble.includes("방문일은 내일"));
  });
  it("매도자 답 속 제안을 놓치지 않는다", async () => {
    const r = analyzeMock(
      { id: "a9", author_type: "demo_agent", author: "AI", text: "내일 오후 2시에 가능합니다" },
      cur({}),
      "2026-10-29T00:00:00.000Z",
      [{ id: "h8", text: "방문일정은 언제되나요?", author_type: "human" }],
    );
    assert.equal(r.intervene, true);
    assert.equal(r.upserts[0].name, "방문일");
    assert.equal(r.upserts[0].proposer, "demo");
    assert.ok(r.bubble && r.bubble.includes("거래 현황에서 확인"));
  });
  it("보실 수 있어요는 제안이다", async () => {
    const r = analyzeMock(
      T("내일 오후 2시에 보실 수 있어요"),
      cur({}),
      "2026-10-29T00:00:00.000Z",
    );
    assert.equal(r.upserts[0].name, "방문일");
    assert.ok(r.bubble && r.bubble.includes("10월 30일"));
  });
  it("날짜 있는 질문은 질문으로 둔다", async () => {
    const r = analyzeMock(
      T("내일 방문 가능해요?"),
      cur({}),
      "2026-10-29T00:00:00.000Z",
    );
    assert.equal(r.upserts[0].status, "unconfirmed");
  });
  it("최근 대화에서 제안을 찾아낸다", async () => {
    const r = analyzeMock(T("네 알겠습니다"), cur({}), "", [
      { id: "h1", text: "44000만원에 합시다", author_type: "human" },
    ]);
    assert.equal(r.upserts[0].name, "매수 희망가");
    assert.equal(r.upserts[0].value, "44,000만원");
    assert.deepEqual(r.upserts[0].evidence, ["h1"]);
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
  it("입장 인사말은 제안으로 기록하지 않는다", async () => {
    const greet = "안녕하세요, AI 매도자(시연)입니다. 급매 매매 투룸 매매 39,000만원, 협의 가능합니다. 궁금한 점을 물어보세요.";
    const r = analyzeMock(T("안녕하세요"), cur({}), "", [
      { id: "h", text: "안녕하세요", author_type: "human" },
      { id: "g", text: greet, author_type: "demo_agent" },
    ]);
    assert.equal(r.intervene, false);
    assert.equal(r.upserts.length, 0);
  });
  it("가능합니다 수락은 매도 제안가로 기록한다", async () => {
    const r = analyzeMock(
      T("시연용으로 가격 38500만원에 가능합니다. (미확정, 사람 확인 필요)", "demo_agent"),
      cur({ "매수 희망가": wish("38,500만원") }),
      "",
      [{ id: "h", text: "38500만원에 합시다", author_type: "human" }],
    );
    assert.equal(r.upserts[0].name, "매도 제안가");
    assert.equal(r.upserts[0].value, "38,500만원");
    assert.ok(r.bubble && r.bubble.includes("매도 제안이"));
  });
  it("계약금 10%는 협상가 기준으로 계산한다", async () => {
    const d = depositAmount("계약금 10%로 합시다", cur({
      "매도 제안가": { name: "매도 제안가", value: "38,500만원", proposer: "demo", status: "proposed" },
    }));
    assert.equal(d.value, "3,850만원");
    assert.ok(d.note.includes("38,500만원"));
    const r = analyzeMock(T("계약금 10%로 합시다"), cur({
      "매도 제안가": { name: "매도 제안가", value: "38,500만원", proposer: "demo", status: "proposed" },
    }));
    const c = r.upserts.find((u) => u.name === "계약금");
    assert.equal(c.value, "3,850만원");
  });
  it("월만 나온 입주는 일을 만들지 않는다", async () => {
    const r = analyzeMock(
      T("입주는 내년 2월에 하고 싶어요"),
      cur({}),
      "2026-10-29T00:00:00+09:00",
    );
    const c = r.upserts.find((u) => u.name === "입주일");
    assert.equal(c.value, "2027년 2월");
  });
  it("잔금과 입주가 어긋나면 인도일 확인을 안내한다", async () => {
    const r = analyzeMock(
      T("입주는 내년 2월에 하고 싶어요"),
      cur({ "잔금일": { name: "잔금일", value: "11월 15일", proposer: "human", status: "proposed" } }),
      "2026-10-29T00:00:00+09:00",
    );
    assert.ok(r.bubble && r.bubble.includes("인도일을 정할까요"));
  });
  it("표시 없는 시간은 후보로 묻고 기록하지 않는다", async () => {
    const r = analyzeMock(T("토요일 1시에 방문하고 싶어요"), cur({}), "2026-10-29T00:00:00+09:00");
    assert.equal(r.upserts.length, 0);
    assert.ok(r.bubble && r.bubble.includes("오후 1시 맞나요"));
  });
  it("오타 요일은 정규화한다", async () => {
    const r = analyzeMock(T("이번주 토오일 1시에 방문하고 싶어요"), cur({}), "2026-10-29T00:00:00+09:00");
    assert.ok(r.bubble && r.bubble.includes("맞나요"));
  });
  it("그때 지시어는 이전 일정을 묻는다", async () => {
    const r = analyzeMock(T("그때 뵐게요"), cur({}), "2026-10-29T00:00:00+09:00", [
      { id: "h", text: "그때 뵐게요", author_type: "human" },
      { id: "h0", text: "내일 오후 2시에 방문하고 싶어요", author_type: "human" },
    ]);
    assert.equal(r.upserts.length, 0);
    assert.ok(r.bubble && r.bubble.includes("말씀하시는 거죠"));
  });
  it("s23 실제 대화: 7억 희망을 70,000만원으로 기록한다", async () => {
    const r = analyzeMock(T("7억에 협의 부탁드려요"), cur({}), "2026-10-29T00:00:00+09:00");
    assert.equal(r.upserts.length, 1);
    assert.equal(r.upserts[0].name, "매수 희망가");
    assert.equal(r.upserts[0].value, "70,000만원");
  });
  it("s23 실제 대화: 7.1억 카운터는 합의가 아니라 재협의다", async () => {
    const r = analyzeMock(
      T("7억1천은 어떠세요", "demo_agent"),
      cur({ "매수 희망가": { name: "매수 희망가", value: "70,000만원", proposer: "human", status: "proposed" } }),
      "2026-10-29T00:00:00+09:00",
    );
    assert.equal(r.upserts.length, 1);
    assert.equal(r.upserts[0].name, "매도 제안가");
    assert.equal(r.upserts[0].value, "71,000만원");
    assert.ok((r.bubble ?? "").includes("확정되지는 않았습니다"));
  });
  it("s23 실제 대화: 토요일 1시는 묻고 기록하지 않는다", async () => {
    const r = analyzeMock(
      T("토요일 1시에 방문하고 싶어요"),
      cur({
        "매수 희망가": { name: "매수 희망가", value: "70,000만원", proposer: "human", status: "proposed" },
        "매도 제안가": { name: "매도 제안가", value: "71,000만원", proposer: "demo", status: "proposed" },
      }),
      "2026-10-29T00:00:00+09:00",
    );
    assert.ok(!r.upserts.some((u) => u.name === "방문일"));
    assert.ok(r.bubble && r.bubble.includes("오후 1시 맞나요"));
  });
  it("확인된 조건이 바뀌면 재협의를 안내한다", async () => {
    const r = analyzeMock(T("43000만원에 합시다"), cur({
      "매수 희망가": { name: "매수 희망가", value: "44,000만원", proposer: "human", status: "proposed", confirmedBy: "u1", confirmedVersion: 1 },
    }));
    assert.ok(r.bubble && r.bubble.includes("다시 협의할까요"));
  });
});

describe("금액 정규화", () => {
  it("만원 표기를 통일한다", async () => {
    assert.equal(normalizeValue("44000만원"), "44,000만원");
    assert.equal(normalizeValue("4억 4000만원"), "44,000만원");
    assert.equal(normalizeValue("2.6억"), "26,000만원");
  });
  it("파싱 불가면 원문을 둔다", async () => {
    assert.equal(normalizeValue("협의 가능"), "협의 가능");
    assert.equal(normalizeValue("5000원"), "5000원");
  });
});

describe("모델 출력 검증", () => {
  const ev = evMap({
    m1: { author_type: "human", text: "44000만원에 합시다" },
    m2: { author_type: "demo_agent", text: "45000만원이면 가능합니다" },
  });
  const cond = (over = {}) => ({
    name: "매수 희망가", value: "44,000만원", proposer: "human", status: "proposed", evidence_ids: ["m1"], ...over,
  });
  it("근거 있는 조건을 살린다", async () => {
    const v = validateZiptalkOutput({ conditions: [cond()], intervene: true, bubble: "안내" }, ev);
    assert.ok(v);
    assert.equal(v.conditions.length, 1);
    assert.equal(v.conditions[0].value, "44,000만원");
  });
  it("다른 방 근거를 버린다", async () => {
    const v = validateZiptalkOutput({ conditions: [cond({ evidence_ids: ["x"] })], intervene: true, bubble: "안내" }, ev);
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("발화자와 제안자가 다르면 버린다", async () => {
    const v = validateZiptalkOutput({ conditions: [cond({ proposer: "demo" })], intervene: true, bubble: "안내" }, ev);
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("원문에 없는 값을 버린다", async () => {
    const v = validateZiptalkOutput({ conditions: [cond({ value: "40,000만원" })], intervene: true, bubble: "안내" }, ev);
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("근거에 없는 연도를 버린다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "입주일", value: "2026-12-01", proposer: "human", status: "proposed", evidence_ids: ["m1"] }], intervene: true, bubble: "안내" },
      evMap({ m1: { author_type: "human", text: "12월에 입주하고 싶어요" } }),
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("비정상 날짜를 버린다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [{ name: "입주일", value: "2026-13-40", proposer: "human", status: "proposed", evidence_ids: ["m1"] }], intervene: true, bubble: "안내" },
      evMap({ m1: { author_type: "human", text: "2026-13-40에 입주" } }),
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("confirmed를 받지 않는다", async () => {
    const v = validateZiptalkOutput({ conditions: [cond({ status: "confirmed" })], intervene: true, bubble: "안내" }, ev);
    assert.ok(v);
    assert.equal(v.conditions.length, 0);
  });
  it("형식 오류는 null이다", async () => {
    assert.equal(validateZiptalkOutput(null, ev), null);
    assert.equal(validateZiptalkOutput({ conditions: "x" }, ev), null);
  });
  it("긴 말풍선은 버리고 조건은 살린다", async () => {
    const v = validateZiptalkOutput(
      { conditions: [cond({ proposer: "demo", evidence_ids: ["m2"], value: "45,000만원", name: "매도 제안가" })], intervene: true, bubble: "x".repeat(300) },
      ev,
    );
    assert.ok(v);
    assert.equal(v.conditions.length, 1);
    assert.equal(v.bubble, null);
    assert.equal(v.intervene, false);
  });
});

describe("분석 입력 계약", () => {
  it("같은 방 근거 ID와 이전 조건을 담는다", async () => {
    const input = buildZiptalkInput("남향 매매", { 가격: "28,000만원" }, [wish("27,000만원", "demo")], [
      { id: "m1", author_type: "human", author: "h", text: "27000에 합시다" },
      { id: "m9", author_type: "assistant", author: "집톡이", text: "정리" },
    ]);
    assert.ok(input.system.includes("28,000만원"));
    assert.ok(input.system.includes("confirmed는 절대 쓰지 마"));
    assert.ok(input.system.includes("매수 희망가"));
    assert.ok(input.messages[0].content.includes("[m1]"));
    assert.ok(input.messages[1].content.includes("집톡이"));
  });
});
