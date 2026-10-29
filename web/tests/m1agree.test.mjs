// VS-4C 양측 합의 HTTP 테스트. mock provider로 실제 API 비용 없이 검증한다.
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

describe("VS-4C 시연방 합의", () => {
  it("가격 제안에 카드가 생기고 AI가 먼저 동의한다", async () => {
    const t = await say(room, "38500만원에 합시다");
    const z = await zip(room, t);
    assert.equal(z.status, 201);
    await zip(room, await invokeAgent(room, t));
    const data = await proposals(room);
    const p = latest(data, "매수 희망가");
    assert.ok(p, "제안 카드가 있어야 한다");
    assert.equal(p.value, "38,500만원");
    assert.equal(p.status, "proposed");
    assert.ok(data.sides.some((s) => s.key === "demo"));
    const demoOk = (data.approvals[p.id] ?? []).some((x) => x.actor_type === "demo" && x.decision === "agree");
    assert.ok(demoOk, "범위 안 가격은 AI가 먼저 동의한다");
  });
  it("사람이 동의하면 양측 동의가 된다", async () => {
    const data = await proposals(room);
    const p = latest(data, "매수 희망가");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "agreed");
  });
  it("중복 동의는 409다", async () => {
    const data = await proposals(room);
    const p = latest(data, "매수 희망가");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 409);
  });
  it("변경 제안은 새 버전이 되고 합의된 이력은 남는다", async () => {
    const t = await say(room, "38000만원에 합시다");
    await zip(room, t);
    const data = await proposals(room);
    const p = latest(data, "매수 희망가");
    assert.equal(p.value, "38,000만원");
    assert.equal(p.version, 2);
    assert.equal(p.status, "proposed");
    const old = data.proposals.find((x) => x.name === "매수 희망가" && x.version === 1);
    assert.equal(old.status, "agreed", "합의된 과거는 고치지 않는다");
    const t2 = await say(room, "37500만원에 합시다");
    await zip(room, t2);
    const data2 = await proposals(room);
    const mid = data2.proposals.find((x) => x.name === "매수 희망가" && x.version === 2);
    assert.equal(mid.status, "superseded", "열린 구버전은 변경됨 처리한다");
    assert.equal(latest(data2, "매수 희망가").version, 3);
  });
  it("구버전 동의는 409다", async () => {
    const data = await proposals(room);
    const p = latest(data, "매수 희망가");
    const r = await decide(room, p.id, "agree", 1);
    assert.equal(r.status, 409);
  });
  it("범위 밖 가격은 AI가 거절한다", async () => {
    const t = await say(room, "36000만원에 합시다");
    await zip(room, t);
    const data = await proposals(room);
    const p = latest(data, "매수 희망가");
    assert.equal(p.value, "36,000만원");
    assert.equal(p.status, "refused");
    assert.ok(p.reason.includes("37,000"));
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 409);
  });
  it("방문 합의는 일정도 수락한다", async () => {
    const t = await say(room, "내일 오후 2시에 방문하고 싶어요");
    await zip(room, t);
    const data = await proposals(room);
    const p = latest(data, "방문일");
    assert.ok(p && p.visit_id, "방문 제안은 visits 행과 연결된다");
    const r = await decide(room, p.id, "agree", p.version);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "agreed");
    const v = await api(`/api/rooms/${room}/visits`, {}, HUMAN);
    assert.equal(v.body.find((x) => x.id === p.visit_id).status, "수락됨");
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
  it("타인은 제안도 동의도 못 한다", async () => {
    assert.equal((await api(`/api/rooms/${room}/proposals`, {}, STRANGER)).status, 403);
    const data = await proposals(room);
    const p = latest(data, "계약금");
    assert.equal((await decide(room, p.id, "agree", p.version, STRANGER)).status, 403);
  });
});

describe("VS-4C 실거래방 합의", () => {
  it("두 사람이 직접 제안하고 합의한다", async () => {
    const c = await api(`/api/rooms/${userRoom}/proposals/create`, {
      method: "POST", body: JSON.stringify({ name: "방문일", value: "12월 1일 오후 2시" }),
    }, HUMAN);
    assert.equal(c.status, 201);
    const pid = c.body.id;
    const d1 = await decide(userRoom, pid, "agree", c.body.version, HUMAN);
    assert.equal(d1.status, 200);
    assert.equal(d1.body.status, "proposed", "한쪽 동의만으로 확정되면 안 된다");
    const d2 = await decide(userRoom, pid, "agree", c.body.version, OWNER);
    assert.equal(d2.status, 200);
    assert.equal(d2.body.status, "agreed");
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
