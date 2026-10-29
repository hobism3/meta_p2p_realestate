// VS-3C 방문 일시 해석 단위 테스트. 네트워크·서버 없이 순수 함수만 검증한다.
// 실행: web/에서 `node --test tests/visit-dates.test.mjs`
// 기준 시각은 KST. ref는 UTC ISO로 준다(2026-10-29T00:00:00Z = KST 10-29 09:00, 목).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseVisitProposal } from "../lib/visit-dates.ts";

const REF = "2026-10-29T00:00:00.000Z";

describe("상대 날짜", () => {
  it("내일·모레를 푼다", async () => {
    assert.equal(parseVisitProposal("내일 오후 2시에 방문하고 싶어요", REF)?.date, "2026-10-30");
    assert.equal(parseVisitProposal("모레 오전 10시에 봐요", REF)?.date, "2026-10-31");
  });
  it("월말 경계를 넘는다", async () => {
    assert.equal(parseVisitProposal("모레 보자", "2026-10-30T00:00:00.000Z")?.date, "2026-11-01");
  });
  it("연도를 넘긴다", async () => {
    assert.equal(parseVisitProposal("1월 2일에 봐요", "2026-12-30T00:00:00.000Z")?.date, "2027-01-02");
  });
  it("다음 주 요일을 푼다", async () => {
    assert.equal(parseVisitProposal("다음 주 화요일에 봐요", REF)?.date, "2026-11-03");
  });
  it("다음 주 단독은 모호하다", async () => {
    assert.equal(parseVisitProposal("다음 주에 봐요", REF), null);
  });
  it("과거는 받지 않는다", async () => {
    assert.equal(parseVisitProposal("어제 보자", REF), null);
    assert.equal(parseVisitProposal("10월 1일에 봐요", REF), null);
  });
  it("없는 날짜는 받지 않는다", async () => {
    assert.equal(parseVisitProposal("2월 30일에 봐요", REF), null);
    assert.equal(parseVisitProposal("13월 40일에 봐요", REF), null);
  });
});

describe("시각", () => {
  it("오전·오후를 푼다", async () => {
    assert.equal(parseVisitProposal("내일 오후 2시에", REF)?.time, "14:00");
    assert.equal(parseVisitProposal("내일 오전 10시 반에", REF)?.time, "10:30");
    assert.equal(parseVisitProposal("내일 14시에", REF)?.time, "14:00");
  });
  it("표시 없는 작은 시간은 모호하다", async () => {
    assert.equal(parseVisitProposal("내일 2시에", REF)?.time, null);
    assert.ok(parseVisitProposal("내일 2시에", REF)?.date);
  });
  it("HH:MM을 받는다", async () => {
    assert.equal(parseVisitProposal("내일 14:00에", REF)?.time, "14:00");
  });
  it("표시 문구를 만든다", async () => {
    assert.equal(parseVisitProposal("내일 오후 2시에", REF)?.display, "10월 30일 오후 2시");
    assert.equal(parseVisitProposal("모레 오전 10시 반에", REF)?.display, "10월 31일 오전 10시 반");
  });
});
