// VS-3A 집톡이 HTTP 테스트. mock provider로 실제 API 비용 없이 검증한다.
// 실행: web/에서 `npm run build` 후 `node --test tests/m1ziptalk.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3137;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `m1ziptalk-test-${process.pid}.db`);
const TOKEN = "test-token";
const SECRET = "m1z-test-secret";
const EXP = Math.floor(Date.now() / 1000) + 3600;

const HUMAN = mintTestToken("u-human", "사람", "tenant", SECRET, EXP);
const OWNER = mintTestToken("u-owner2", "주인", "landlord", SECRET, EXP);
const STRANGER = mintTestToken("u-stranger", "타인", "tenant", SECRET, EXP);

let server;
let roomA = "";
let roomB = "";
let userRoom = "";
let firstTrigger = "";
let assistantCount = 0;

async function api(path, init = {}, bearer = null) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-write-token": TOKEN,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

async function assistantBubbles(room) {
  const list = await api(`/api/rooms/${room}/messages`, {}, HUMAN);
  return list.body.filter((m) => m.author_type === "assistant");
}

async function say(room, text) {
  const r = await api(`/api/rooms/${room}/messages`, {
    method: "POST", body: JSON.stringify({ text }),
  }, HUMAN);
  assert.equal(r.status, 201);
  return r.body.id;
}

async function zip(room, trigger) {
  return api(`/api/rooms/${room}/ziptalk/invoke`, {
    method: "POST",
    body: JSON.stringify(trigger ? { trigger_message_id: trigger } : {}),
  }, HUMAN);
}

before(async () => {
  server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      DB_PATH: DB,
      WRITE_TOKEN: TOKEN,
      RATE_LIMIT_PER_MIN: "1000",
      SUPABASE_JWT_SECRET: SECRET,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch { /* 대기 */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  const a = await api("/api/deals/s21/rooms", { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(a.status, 201);
  roomA = a.body.id;
  const b = await api("/api/deals/s22/rooms", { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(b.status, 201);
  roomB = b.body.id;
  const created = await api("/api/listings", {
    method: "POST",
    body: JSON.stringify({
      title: "집톡이실거래", address: "서울 관악구 집톡이로 1 (가상)", tradeType: "월세",
      deposit: 1000, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
      options: [], description: "", publisher: "주인",
    }),
  }, OWNER);
  assert.equal(created.status, 201);
  const u = await api(`/api/deals/${created.body.id}/rooms`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(u.status, 201);
  userRoom = u.body.id;
});

after(() => {
  if (server) server.kill();
  try {
    rmSync(DB, { force: true });
    rmSync(`${DB}-wal`, { force: true });
    rmSync(`${DB}-shm`, { force: true });
  } catch { /* 무시 */ }
});

describe("VS-3A 조건 기록", () => {
  it("가격 제안을 기록하고 개입한다", async () => {
    firstTrigger = await say(roomA, "44000만원에 합시다");
    const r = await zip(roomA, firstTrigger);
    assert.equal(r.status, 201);
    assert.ok(r.body.bubble_message_id);
    assert.equal(r.body.provider, "mock");
    const bubbles = await assistantBubbles(roomA);
    assert.equal(bubbles.length, 1);
    assert.ok(bubbles[0].text.includes("새로 제안됐어요"));
    assert.ok(bubbles[0].author.includes("집톡이"));
    assistantCount = bubbles.length;
    const c = await api(`/api/rooms/${roomA}/conditions`, {}, HUMAN);
    assert.equal(c.status, 200);
    const price = c.body.conditions.find((x) => x.name === "매수 희망가");
    assert.equal(price.value, "44,000만원");
    assert.equal(price.status, "proposed");
    assert.ok(JSON.parse(price.source_msg_ids).includes(firstTrigger));
    assert.equal(c.body.history.length, 0);
    const first = c.body.conditions.find((x) => x.name === "최초가");
    assert.equal(first.value, "45,000만원");
    assert.equal(first.status, "proposed");
    assert.equal(first.proposer, "demo");
  });
  it("변경은 이력을 남긴다", async () => {
    const t = await say(roomA, "44500만원에 합시다");
    const r = await zip(roomA, t);
    assert.equal(r.status, 201);
    const bubbles = await assistantBubbles(roomA);
    assert.equal(bubbles.length, assistantCount + 1);
    assert.ok(bubbles[bubbles.length - 1].text.includes("변경"));
    assistantCount = bubbles.length;
    const c = await api(`/api/rooms/${roomA}/conditions`, {}, HUMAN);
    assert.equal(c.body.conditions.find((x) => x.name === "매수 희망가").value, "44,500만원");
    assert.equal(c.body.history.length, 1);
    assert.equal(c.body.history[0].old_value, "44,000만원");
    assert.equal(c.body.history[0].new_value, "44,500만원");
  });
  it("같은 트리거 재호출은 중복 개입하지 않는다", async () => {
    const r = await zip(roomA, firstTrigger);
    assert.equal(r.status, 200);
    assert.equal(r.body.created, false);
    assert.equal((await assistantBubbles(roomA)).length, assistantCount);
  });
  it("관련 없는 대화는 조용하다", async () => {
    const t = await say(roomA, "안녕하세요");
    const r = await zip(roomA, t);
    assert.equal(r.status, 200);
    assert.equal(r.body.bubble_message_id, null);
    assert.equal((await assistantBubbles(roomA)).length, assistantCount);
  });
  it("미확인을 기록한다", async () => {
    const t = await say(roomB, "입주일은 언제인가요?");
    const r = await zip(roomB, t);
    assert.equal(r.status, 201);
    const c = await api(`/api/rooms/${roomB}/conditions`, {}, HUMAN);
    const move = c.body.conditions.find((x) => x.name === "입주일");
    assert.equal(move.status, "unconfirmed");
  });
  it("방 격리를 지킨다", async () => {
    const a = await api(`/api/rooms/${roomA}/conditions`, {}, HUMAN);
    assert.equal(a.body.conditions.find((x) => x.name === "매수 희망가").value, "44,500만원");
    const b = await api(`/api/rooms/${roomB}/conditions`, {}, HUMAN);
    assert.ok(b.body.conditions.every((x) => x.name !== "매수 희망가" && x.name !== "매도 제안가"));
  });
  it("집톡이에는 반응하지 않는다", async () => {
    const bubbles = await assistantBubbles(roomA);
    const r = await zip(roomA, bubbles[0].id);
    assert.equal(r.status, 409);
  });
  it("제삼자·실거래방은 거부한다", async () => {
    const t = await say(roomA, "44000만원에 합시다");
    assert.equal((await api(`/api/rooms/${roomA}/ziptalk/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: t }),
    }, STRANGER)).status, 403);
    assert.equal((await api(`/api/rooms/${roomA}/conditions`, {}, STRANGER)).status, 403);
    const u = await say(userRoom, "보증금 얼마인가요?");
    assert.equal((await api(`/api/rooms/${userRoom}/ziptalk/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: u }),
    }, HUMAN)).status, 403);
  });
});

describe("VS-3B 사용자 확인", () => {
  it("현재 버전을 확인한다", async () => {
    const r = await api(`/api/rooms/${roomA}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "매수 희망가" }),
    }, HUMAN);
    assert.equal(r.status, 200);
    assert.equal(r.body.version, 2);
    const c = await api(`/api/rooms/${roomA}/conditions`, {}, HUMAN);
    const w = c.body.conditions.find((x) => x.name === "매수 희망가");
    assert.ok(w.confirmed_by);
    assert.equal(w.confirmed_version, 2);
  });
  it("값이 바뀌면 확인이 무효가 된다", async () => {
    const t = await say(roomA, "43000만원에 합시다");
    const z = await zip(roomA, t);
    assert.equal(z.status, 201);
    const c = await api(`/api/rooms/${roomA}/conditions`, {}, HUMAN);
    const w = c.body.conditions.find((x) => x.name === "매수 희망가");
    assert.equal(w.value, "43,000만원");
    assert.equal(w.version, 3);
    assert.ok(w.confirmed_by);
    assert.ok(w.confirmed_version < w.version);
  });
  it("없는 조건은 404, 비멤버 확인은 403이다", async () => {
    assert.equal((await api(`/api/rooms/${roomA}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "없는 조건" }),
    }, HUMAN)).status, 404);
    assert.equal((await api(`/api/rooms/${roomA}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "매수 희망가" }),
    }, STRANGER)).status, 403);
    assert.equal((await api(`/api/rooms/${roomA}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "매수 희망가" }),
    }, OWNER)).status, 403);
  });
});

describe("집톡이 반복 개입 방지·직접 답변", () => {
  it("같은 제안을 반복해도 추가 개입하지 않는다", async () => {
    const before = (await assistantBubbles(roomA)).length;
    const t = await say(roomA, "43000만원에 합시다");
    const r = await zip(roomA, t);
    assert.equal(r.status, 200);
    assert.equal(r.body.bubble_message_id, null);
    assert.equal((await assistantBubbles(roomA)).length, before);
  });
  it("아는 가격은 직접 답해준다", async () => {
    const t = await say(roomA, "매매가 얼마인가요?");
    const r = await zip(roomA, t);
    assert.equal(r.status, 201);
    const bubbles = await assistantBubbles(roomA);
    const last = bubbles[bubbles.length - 1];
    assert.ok(last.text.includes("43,000만원"));
    assert.ok(!last.text.includes("확인이 필요"));
  });
});

describe("VS-3C 방문 일정", () => {
  it("방문 제안을 행으로 만든다", async () => {
    const t = await say(roomA, "내일 오후 2시에 방문하고 싶어요");
    const z = await zip(roomA, t);
    assert.equal(z.status, 201);
    const v = await api(`/api/rooms/${roomA}/visits`, {}, HUMAN);
    assert.equal(v.status, 200);
    assert.equal(v.body.length, 1);
    assert.equal(v.body[0].status, "제안됨");
    assert.equal(v.body[0].proposed_by, "human");
    assert.ok(/^\d{2}:\d{2}$/.test(v.body[0].visit_time));
    const c = await api(`/api/rooms/${roomA}/conditions`, {}, HUMAN);
    assert.ok(c.body.conditions.find((x) => x.name === "방문일" && x.value));
  });
  it("같은 제안은 중복 생성하지 않는다", async () => {
    const t = await say(roomA, "내일 오후 2시에 방문하고 싶어요");
    await zip(roomA, t);
    const v = await api(`/api/rooms/${roomA}/visits`, {}, HUMAN);
    assert.equal(v.body.length, 1);
  });
  it("일정을 확인하면 수락되고 조건도 확인된다", async () => {
    const v = await api(`/api/rooms/${roomA}/visits`, {}, HUMAN);
    const id = v.body[0].id;
    const p = await api(`/api/rooms/${roomA}/visits/${id}`, {
      method: "PATCH", body: JSON.stringify({ status: "수락됨" }),
    }, HUMAN);
    assert.equal(p.status, 200);
    const c = await api(`/api/rooms/${roomA}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "방문일" }),
    }, HUMAN);
    assert.equal(c.status, 200);
    const g = await api(`/api/rooms/${roomA}/visits`, {}, HUMAN);
    assert.equal(g.body.find((x) => x.id === id).status, "수락됨");
  });
  it("구버전 확인은 409다", async () => {
    const r = await api(`/api/rooms/${roomA}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "매수 희망가", version: 1 }),
    }, HUMAN);
    assert.equal(r.status, 409);
  });
  it("모호한 날짜는 행을 만들지 않는다", async () => {
    const t = await say(roomB, "다음 주에 방문하고 싶어요");
    await zip(roomB, t);
    const v = await api(`/api/rooms/${roomB}/visits`, {}, HUMAN);
    assert.equal(v.body.length, 0);
  });
  it("제삼자는 방문을 못 본다", async () => {
    assert.equal((await api(`/api/rooms/${roomA}/visits`, {}, STRANGER)).status, 403);
  });
});

describe("VS-4A 결함 수정", () => {
  it("실거래방에는 AI가 끼지 않는다", async () => {
    const t = await say(userRoom, "보증금 협의 가능할까요?");
    const r = await api(`/api/rooms/${userRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: t }),
    }, HUMAN);
    assert.equal(r.status, 404);
    const list = await api(`/api/rooms/${userRoom}/messages`, {}, HUMAN);
    assert.ok(list.body.every((m) => m.author_type === "human"));
  });
  it("AI 답을 트리거로 분석해도 중복 개입하지 않는다", async () => {
    const before = (await assistantBubbles(roomA)).length;
    const t = await say(roomA, "매매가 얼마인가요?");
    const inv = await api(`/api/rooms/${roomA}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: t }),
    }, HUMAN);
    assert.equal(inv.status, 201);
    const z = await api(`/api/rooms/${roomA}/ziptalk/invoke`, {
      method: "POST", body: JSON.stringify({}),
    }, HUMAN);
    assert.equal(z.status, 200);
    assert.equal((await assistantBubbles(roomA)).length, before);
  });
  it("버전 어긋난 일정 수락은 둘 다 바꾸지 않는다", async () => {
    const created = await api(`/api/rooms/${roomA}/visits`, {
      method: "POST", body: JSON.stringify({ date: "2099-12-31", time: "14:00" }),
    }, HUMAN);
    assert.equal(created.status, 201);
    const bad = await api(`/api/rooms/${roomA}/visits/${created.body.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "수락됨", confirm_visit: true, condition_version: 999 }),
    }, HUMAN);
    assert.equal(bad.status, 409);
    const v = await api(`/api/rooms/${roomA}/visits`, {}, HUMAN);
    assert.equal(v.body.find((x) => x.id === created.body.id).status, "제안됨");
  });
});
