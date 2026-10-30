import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { brokerSnapshot } from "../lib/broker-companion.ts";

const makeCondition = (name, value, checked = false) => ({
  name, value, proposer: "demo", status: "proposed", source_msg_ids: "[]",
  version: 2, confirmed_by: checked ? "user" : "",
  confirmed_at: "", confirmed_version: checked ? 2 : 0,
  confirmed_name: "", updated_at: "2026-10-30T10:00:00Z",
});
const makeVisit = (time, status = "제안됨") => ({
  id: "visit-1", visit_date: "2026-10-31", visit_time: time, status,
  proposed_by: "demo", source_msg_ids: "[]", decided_by: "", decided_at: "",
});
const note = (text) => ({
  id: "zip-1", listing_id: "s16", author: "집톡이", author_type: "assistant",
  role: "", text, created_at: "2026-10-30T10:00:00Z",
});
const human = (text) => ({
  id: "human-1", listing_id: "s16", author: "사람", author_type: "human",
  role: "", text, created_at: "2026-10-30T10:00:00Z",
});
function snapshot(overrides = {}) {
  return brokerSnapshot({ tradeType: "월세", conditions: [], visits: [], chat: [], ...overrides });
}

describe("동네 부동산 친구 집톡이", () => {
  it("새 대화에서는 단정 없이 인사하고 질문을 제안한다", () => {
    const s = snapshot();
    assert.equal(s.category, "welcome");
    assert.match(s.quip, /옆에서/);
    assert.equal(s.checkpoints.length, 3);
    assert.ok(s.checkpoints.every((c) => c.status === "not-started"));
    assert.match(s.nextStep.prompt, /방문 가능한/);
  });
  it("가격 제안은 확정으로 둔갑하지 않는다", () => {
    const s = snapshot({
      conditions: [
        makeCondition("임차 희망 조건", "보증금 3,000만원/월세 60만원"),
        makeCondition("임대 제안 조건", "보증금 3,000만원/월세 72만원"),
      ],
      latestNote: note("보증금 3천, 월세 60에 대한 문의가 들어왔어요."),
    });
    assert.equal(s.category, "price");
    assert.equal(s.checkpoints[0].status, "talking");
    assert.match(s.quip, /아직 합의됐다고/);
    assert.match(s.nextStep.prompt, /가격 조건/);
  });
  it("10월 31일 오후 3시 방문 제안: 시간과 미확정 상태를 정확히 말한다", () => {
    const s = snapshot({
      visits: [makeVisit("15:00")],
      conditions: [makeCondition("방문일", "10월 31일 오후 3시")],
      latestNote: note("방문 일정은 10월 31일 오후 3시로 제안됐어요."),
    });
    assert.equal(s.category, "visit");
    assert.equal(s.checkpoints[1].status, "pending");
    assert.match(s.quip, /10월 31일 오후 3시/);
    assert.match(s.quip, /제안 단계/);
    assert.match(s.nextStep.prompt, /10월 31일 오후 3시/);
    assert.doesNotMatch(s.quip, /확정됐어요/);
  });
  it("실제 수락된 방문만 확인됨으로 보여준다", () => {
    const s = snapshot({
      visits: [makeVisit("15:00", "수락됨")],
      latestNote: note("방문 일정이 정리됐어요."),
    });
    assert.equal(s.checkpoints[1].status, "checked");
    assert.match(s.quip, /확인됐네요/);
  });
  it("기존 수락 뒤 새 제안이 생기면 최신 미확정을 우선한다", () => {
    const s = snapshot({
      visits: [makeVisit("14:00", "수락됨"), { ...makeVisit("15:00"), id: "visit-2" }],
      latestNote: note("방문 시간을 바꿔볼까요?"),
    });
    assert.equal(s.checkpoints[1].status, "pending");
    assert.match(s.nextStep.note, /오후 3시/);
  });
  it("이전 방문이 확인됐어도 새 제안이 있으면 다시 확인이 필요하다", () => {
    const s = snapshot({
      visits: [makeVisit("15:00"), { ...makeVisit("14:00", "수락됨"), id: "visit-old" }],
      conditions: [makeCondition("방문일", "10월 31일 오후 2시", true)],
      latestNote: note("방문 시간이 변경됐어요."),
    });
    assert.equal(s.checkpoints[1].status, "pending");
    assert.match(s.quip, /제안 단계/);
  });
  it("API가 방문 날짜 순서로 줘도 최신 제안 시각의 상태를 따른다", () => {
    const oldPending = { ...makeVisit("15:00"), id: "old-pending", created_at: "2026-10-30T09:00:00Z" };
    const newerAccepted = { ...makeVisit("14:00", "수락됨"), id: "new-accepted", created_at: "2026-10-30T11:00:00Z" };
    const s = snapshot({
      visits: [oldPending, newerAccepted],
      latestNote: note("방문 일정이 정리됐어요."),
    });
    assert.equal(s.checkpoints[1].status, "checked");
  });
  it("고양이 문의는 허용을 단정하지 않고 다음 확인만 제안한다", () => {
    const s = snapshot({
      chat: [human("고양이 키워도 되나요?")],
      visits: [makeVisit("15:00", "수락됨")],
      latestNote: note("옵션도 함께 확인해 주세요."),
    });
    assert.equal(s.checkpoints[2].status, "talking");
    assert.match(s.nextStep.title, /반려동물/);
    assert.doesNotMatch(s.nextStep.note, /허용됩니다/);
  });
  it("확정 버전이 달라지면 확인 완료를 철회한다", () => {
    const c = makeCondition("월세 조건", "보증금 3,000만원/월세 72만원", true);
    c.version = 3;
    const s = snapshot({ conditions: [c], latestNote: note("월세 조건이 바뀌었어요.") });
    assert.equal(s.checkpoints[0].status, "pending");
  });
});
