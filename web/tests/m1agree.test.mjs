// VS-4C.3 양측 합의 HTTP 테스트. mock provider로 실제 API 비용 없이 검증한다.
// 희망가·역제안은 카드가 되지 않고, 최종 협의 후보 1건에만 동의 버튼이 있다.
// 실행: web/에서 `npm run build` 후 `node --test tests/m1agree.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3143;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `m1agree-test-${process.pid}.db`);
const TOKEN = "test-token";
const SECRET = "m1a-test-secret";
const EXP = Math.floor(Date.now() / 1000) + 3600;

const HUMAN = mintTestToken("u-human", "사람", "tenant", SECRET, EXP);
const OWNER = mintTestToken("u-owner", "주인", "landlord", SECRET, EXP);
const STRANGER = mintTestToken("u-stranger", "타인", "tenant", SECRET, EXP);

let server;
let room = "";
let userRoom = "";
let listingId = "";
let rentRoom = "";
let jeonseRoom = "";

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

async function say(r, text, who = HUMAN) {
  const res = await api(`/api/rooms/${r}/messages`, {
    method: "POST", body: JSON.stringify({ text }),
  }, who);
  assert.equal(res.status, 201);
  return res.body.id;
}

async function zip(r, trigger, who = HUMAN) {
  return api(`/api/rooms/${r}/ziptalk/invoke`, {
    method: "POST",
    body: JSON.stringify(trigger ? { trigger_message_id: trigger } : {}),
  }, who);
}

async function invokeAgent(r, trigger, who = HUMAN) {
  const res = await api(`/api/rooms/${r}/agent/invoke`, {
    method: "POST", body: JSON.stringify({ trigger_message_id: trigger }),
  }, who);
  assert.equal(res.status, 201);
  const list = await api(`/api/rooms/${r}/messages`, {}, who);
  const ai = list.body.filter((m) => m.author_type === "demo_agent");
  assert.ok(ai.length > 0);
  return ai[ai.length - 1].id;
}

async function proposals(r, who = HUMAN) {
  const res = await api(`/api/rooms/${r}/proposals`, {}, who);
  assert.equal(res.status, 200);
  return res.body;
}

async function decide(r, pid, decision, version, who = HUMAN) {
  return api(`/api/rooms/${r}/proposals/${pid}/decide`, {
    method: "POST", body: JSON.stringify({ decision, version }),
  }, who);
}

async function conditionsOf(r, who = HUMAN) {
  const res = await api(`/api/rooms/${r}/conditions`, {}, who);
  assert.equal(res.status, 200);
  return res.body.conditions;
}

function latest(props, name) {
  const list = props.proposals.filter((p) => p.name === name && p.status !== "superseded");
  return list[list.length - 1];
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
  const a = await api("/api/deals/s24/rooms", { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(a.status, 201);
  room = a.body.id;
  const s02 = await api("/api/deals/s02/rooms", { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(s02.status, 201);
  rentRoom = s02.body.id;
  const s04 = await api("/api/deals/s04/rooms", { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(s04.status, 201);
  jeonseRoom = s04.body.id;
  const created = await api("/api/listings", {
    method: "POST",
    body: JSON.stringify({
      title: "합의실거래", address: "서울 관악구 합의로 1 (가상)", tradeType: "월세",
      deposit: 1000, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
      options: [], description: "", publisher: "주인",
    }),
  }, OWNER);
  assert.equal(created.status, 201);
  listingId = created.body.id;
  const u = await api(`/api/deals/${listingId}/rooms`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
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

describe("VS-4C.3 시연방 매매 합의", () => {
  it("사람 제안은 이력에만 남고 카드가 없다", async () => {
    const t = await say(room, "38500만원에 합시다");
    const z = await zip(room, t);
    assert.equal(z.status, 201);
    const data = await proposals(room);
    assert.ok(!data.proposals.some((p) => p.name === "매수 희망가" || p.name === "매도 제안가"), "희망·역제안 카드는 없어야 한다");
    assert.ok(!data.proposals.some((p) => p.name === "최종 매매가"), "수렴 전에는 최종 후보도 없다");
    const all = await conditionsOf(room);
    assert.equal(all.find((x) => x.name === "매수 희망가").value, "38,500만원");
  });
  it("AI가 맞추면 최종 후보 1건에 AI가 먼저 동의한다", async () => {
    const t = await say(room, "38500만원에 합시다");
    await zip(room, await invokeAgent(room, t));
    const data = await proposals(room);
    const finals = data.proposals.filter((p) => p.name === "최종 매매가" && p.status !== "superseded");
    assert.equal(finals.length, 1);
    const p = finals[0];
    assert.equal(p.value, "38,500만원");
    assert.equal(p.status, "proposed");
    const demoOk = (data.approvals[p.id] ?? []).some((x) => x.actor_type === "demo" && x.decision === "agree");
    assert.ok(demoOk, "범위 안 가격은 AI가 먼저 동의한다");
  });
  it("사람이 동의하면 양측 동의가 된다", async () => {
    const data = await proposals(room);
    const p = latest(data, "최종 매매가");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "agreed");
  });
  it("중복 동의는 409다", async () => {
    const data = await proposals(room);
    const p = latest(data, "최종 매매가");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 409);
  });
  it("계약금 10% 제안을 합의한다", async () => {
    const t = await say(room, "계약금 10%로 합시다");
    await zip(room, t);
    const data = await proposals(room);
    const p = latest(data, "계약금");
    assert.equal(p.value, "3,850만원");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.body.status, "agreed");
  });
  it("변경 제안은 새 버전이 되고 합의된 이력은 남는다", async () => {
    const t = await say(room, "38000만원에 합시다");
    await zip(room, t);
    await zip(room, await invokeAgent(room, t));
    const data = await proposals(room);
    const p = latest(data, "최종 매매가");
    assert.equal(p.value, "38,000만원");
    assert.equal(p.version, 2);
    assert.equal(p.status, "proposed");
    const old = data.proposals.find((x) => x.name === "최종 매매가" && x.version === 1);
    assert.equal(old.status, "agreed", "합의된 과거는 고치지 않는다");
    const t2 = await say(room, "37500만원에 합시다");
    await zip(room, t2);
    await zip(room, await invokeAgent(room, t2));
    const data2 = await proposals(room);
    const mid = data2.proposals.find((x) => x.name === "최종 매매가" && x.version === 2);
    assert.equal(mid.status, "superseded", "열린 구버전은 변경됨 처리한다");
    assert.equal(latest(data2, "최종 매매가").version, 3);
  });
  it("구버전 동의는 409다", async () => {
    const data = await proposals(room);
    const p = latest(data, "최종 매매가");
    const r = await decide(room, p.id, "agree", 1);
    assert.equal(r.status, 409);
  });
  it("범위 밖 가격은 최종 후보가 생기지 않는다", async () => {
    const t = await say(room, "36000만원에 합시다");
    await zip(room, t);
    await zip(room, await invokeAgent(room, t));
    const data = await proposals(room);
    assert.ok(!data.proposals.some((p) => p.name === "최종 매매가" && p.value === "36,000만원"));
  });
  it("희망가 직접 카드는 400이다", async () => {
    const c = await api(`/api/rooms/${room}/proposals/create`, {
      method: "POST", body: JSON.stringify({ name: "매수 희망가", value: "38,500만원" }),
    }, HUMAN);
    assert.equal(c.status, 400);
  });
  it("방문 합의는 일정도 수락한다", async () => {
    const t = await say(room, "내일 오후 2시에 방문하고 싶어요");
    await zip(room, await invokeAgent(room, t));
    const data = await proposals(room);
    const p = latest(data, "방문일");
    assert.ok(p && p.visit_id, "방문 제안은 visits 행과 연결된다");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "agreed");
    const v = await api(`/api/rooms/${room}/visits`, {}, HUMAN);
    assert.equal(v.body.find((x) => x.id === p.visit_id).status, "수락됨");
  });
  it("방문 변경은 제안을 분리하고 섞지 않는다", async () => {
    const t = await say(room, "모레 낮 12시에 방문하고 싶어요");
    await zip(room, t);
    const data = await proposals(room);
    const visits = data.proposals.filter((p) => p.name === "방문일" && p.status !== "superseded");
    assert.equal(visits.length, 2);
    assert.notEqual(visits[0].visit_id, visits[1].visit_id, "서로 다른 visits 행에 연결되어야 한다");
    const first = visits.find((p) => p.version === 1);
    const second = visits.find((p) => p.version === 2);
    assert.equal(first.status, "agreed");
    assert.equal(second.status, "proposed");
    const demoWait = (data.approvals[second.id] ?? []).some((x) => x.actor_type === "demo");
    assert.equal(demoWait, false, "AI가 말하지 않은 일정은 대기한다");
    const r = await decide(room, second.id, "agree", second.version);
    assert.equal(r.body.status, "proposed", "AI 대기 중에는 사람 동의만으로 확정되면 안 된다");
    const v = await api(`/api/rooms/${room}/visits`, {}, HUMAN);
    assert.equal(v.body.find((x) => x.id === first.visit_id).status, "수락됨");
    assert.equal(v.body.find((x) => x.id === second.visit_id).status, "제안됨");
  });
  it("타인은 제안도 동의도 못 한다", async () => {
    assert.equal((await api(`/api/rooms/${room}/proposals`, {}, STRANGER)).status, 403);
    const data = await proposals(room);
    const p = latest(data, "계약금");
    assert.equal((await decide(room, p.id, "agree", p.version, STRANGER)).status, 403);
  });
});

describe("VS-4C.3 s02 월세 골든 회귀", () => {
  it("두 값 제안은 이력에만 남는다", async () => {
    const t = await say(rentRoom, "보증금 5000으로 올리고 월세 65로");
    const z = await zip(rentRoom, t);
    assert.equal(z.status, 201);
    const data = await proposals(rentRoom);
    assert.equal(data.proposals.length, 0, "수렴 전에는 카드가 없다");
    assert.ok(data.sides.some((s) => s.label === "임차인"));
    assert.ok(data.sides.some((s) => s.label === "AI 임대인(시연)"));
    const all = await conditionsOf(rentRoom);
    assert.equal(all.find((x) => x.name === "임차 희망 조건").value, "보증금 5,000만원/월세 65만원");
    assert.ok(!all.some((x) => x.name === "매수 희망가" || x.name === "매도 제안가"));
  });
  it("AI가 두 값을 수락하면 카드 1건에 시연 동의한다", async () => {
    const t = await say(rentRoom, "보증금 5000으로 올리고 월세 65로");
    await zip(rentRoom, await invokeAgent(rentRoom, t));
    const data = await proposals(rentRoom);
    const cards = data.proposals.filter((p) => p.status !== "superseded");
    assert.equal(cards.length, 1, "최종 후보 카드는 1개다");
    assert.equal(cards[0].name, "월세 조건");
    assert.equal(cards[0].value, "보증금 5,000만원/월세 65만원");
    const ap = data.approvals[cards[0].id] ?? [];
    assert.ok(ap.some((x) => x.actor_type === "demo" && x.decision === "agree"), "AI 임대인은 시연 동의한다");
    assert.ok(ap.every((x) => x.actor_type !== "human"), "임차인은 아직 대기다");
  });
  it("임차인이 동의하면 양측 동의가 되고 새로고침에도 유지된다", async () => {
    const data = await proposals(rentRoom);
    const p = latest(data, "월세 조건");
    const r = await decide(rentRoom, p.id, "agree", p.version);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "agreed");
    const again = await proposals(rentRoom);
    assert.equal(latest(again, "월세 조건").status, "agreed");
  });
  it("한 값만 바꾸면 새 버전 후보가 되고 과거 승인을 재사용하지 않는다", async () => {
    const t = await say(rentRoom, "월세 70으로 해주세요");
    await zip(rentRoom, t);
    const mid = await proposals(rentRoom);
    assert.equal(latest(mid, "월세 조건").version, 1, "AI 수락 전에는 새 카드가 없다");
    assert.equal(latest(mid, "월세 조건").status, "agreed");
    const all = await conditionsOf(rentRoom);
    assert.equal(all.find((x) => x.name === "임차 희망 조건").value, "보증금 5,000만원/월세 70만원");
    await zip(rentRoom, await invokeAgent(rentRoom, t));
    const data = await proposals(rentRoom);
    const p = latest(data, "월세 조건");
    assert.equal(p.version, 2);
    assert.equal(p.value, "보증금 5,000만원/월세 70만원");
    assert.equal(p.status, "proposed", "새 버전은 동의를 다시 받아야 한다");
    const old = data.proposals.find((x) => x.name === "월세 조건" && x.version === 1);
    assert.equal(old.status, "agreed", "합의된 과거는 고치지 않는다");
    const r = await decide(rentRoom, p.id, "agree", p.version);
    assert.equal(r.body.status, "agreed");
  });
  it("철회는 이력만 미확인으로 두고 카드를 건드리지 않는다", async () => {
    const before = (await proposals(rentRoom)).proposals.length;
    const t = await say(rentRoom, "제안은 취소합니다");
    await zip(rentRoom, t);
    const data = await proposals(rentRoom);
    assert.equal(data.proposals.length, before);
    const all = await conditionsOf(rentRoom);
    assert.equal(all.find((x) => x.name === "임차 희망 조건").status, "unconfirmed");
  });
});

describe("VS-4C.3 시연방 전세 합의", () => {
  it("같은 보증금에 수렴하면 최종 후보 1건이 합의된다", async () => {
    const t = await say(jeonseRoom, "18000만원에 합시다");
    const z = await zip(jeonseRoom, t);
    assert.equal(z.status, 201);
    const pre = await proposals(jeonseRoom);
    assert.ok(!pre.proposals.some((p) => p.name === "최종 전세보증금"));
    await zip(jeonseRoom, await invokeAgent(jeonseRoom, t));
    const data = await proposals(jeonseRoom);
    const cards = data.proposals.filter((p) => p.name === "최종 전세보증금" && p.status !== "superseded");
    assert.equal(cards.length, 1);
    assert.equal(cards[0].value, "전세보증금 18,000만원");
    const r = await decide(jeonseRoom, cards[0].id, "agree", cards[0].version);
    assert.equal(r.body.status, "agreed");
  });
});

describe("VS-4C.3 실거래방 월세 합의", () => {
  it("두 사람이 묶음에 직접 합의한다", async () => {
    const c = await api(`/api/rooms/${userRoom}/proposals/create`, {
      method: "POST", body: JSON.stringify({ name: "월세 조건", value: "보증금 1,200만원/월세 55만원" }),
    }, HUMAN);
    assert.equal(c.status, 201);
    const pid = c.body.id;
    const d1 = await decide(userRoom, pid, "agree", c.body.version, HUMAN);
    assert.equal(d1.status, 200);
    assert.equal(d1.body.status, "proposed", "한쪽 동의만으로 확정되면 안 된다");
    const d2 = await decide(userRoom, pid, "agree", c.body.version, OWNER);
    assert.equal(d2.status, 200);
    assert.equal(d2.body.status, "agreed");
    const data = await proposals(userRoom);
    assert.ok(data.sides.some((s) => s.label === "임차인"));
    assert.ok(data.sides.some((s) => s.label === "임대인"));
  });
  it("한 값만으로는 카드를 만들 수 없다", async () => {
    const c = await api(`/api/rooms/${userRoom}/proposals/create`, {
      method: "POST", body: JSON.stringify({ name: "월세 조건", value: "보증금 1,200만원" }),
    }, HUMAN);
    assert.equal(c.status, 400);
  });
  it("다른 유형 최종가는 만들 수 없다", async () => {
    const c = await api(`/api/rooms/${userRoom}/proposals/create`, {
      method: "POST", body: JSON.stringify({ name: "최종 매매가", value: "50,000만원" }),
    }, HUMAN);
    assert.equal(c.status, 400);
  });
  it("거절하면 거절 상태가 된다", async () => {
    const c = await api(`/api/rooms/${userRoom}/proposals/create`, {
      method: "POST", body: JSON.stringify({ name: "입주일", value: "2027년 2월" }),
    }, OWNER);
    assert.equal(c.status, 201);
    const r = await decide(userRoom, c.body.id, "refuse", c.body.version, HUMAN);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "refused");
  });
});
