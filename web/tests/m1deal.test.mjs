// VS-4B 거래 정합성 회귀 테스트. mock provider로 실제 API 비용 없이 검증한다.
// 실대화 시나리오: 3.9억 제안→3.85억 재협의→계약금 10%→방문 내일→잔금 다음달 15일→입주 내년 2월.
// 실행: web/에서 `npm run build` 후 `node --test tests/m1deal.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3141;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `m1deal-test-${process.pid}.db`);
const TOKEN = "test-token";
const SECRET = "m1d-test-secret";
const EXP = Math.floor(Date.now() / 1000) + 3600;

const HUMAN = mintTestToken("u-human", "사람", "tenant", SECRET, EXP);

let server;
let room = "";

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

async function say(text) {
  const r = await api(`/api/rooms/${room}/messages`, {
    method: "POST", body: JSON.stringify({ text }),
  }, HUMAN);
  assert.equal(r.status, 201);
  return r.body.id;
}

async function zip(trigger) {
  return api(`/api/rooms/${room}/ziptalk/invoke`, {
    method: "POST",
    body: JSON.stringify(trigger ? { trigger_message_id: trigger } : {}),
  }, HUMAN);
}

async function invokeAgent(trigger) {
  const r = await api(`/api/rooms/${room}/agent/invoke`, {
    method: "POST", body: JSON.stringify({ trigger_message_id: trigger }),
  }, HUMAN);
  assert.equal(r.status, 201);
  const list = await api(`/api/rooms/${room}/messages`, {}, HUMAN);
  const ai = list.body.filter((m) => m.author_type === "demo_agent");
  assert.ok(ai.length > 0);
  return ai[ai.length - 1].id;
}

async function conditions() {
  const c = await api(`/api/rooms/${room}/conditions`, {}, HUMAN);
  assert.equal(c.status, 200);
  return c.body.conditions;
}

function condOf(all, name) {
  return all.find((x) => x.name === name);
}

function kstBase() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1 };
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
});

after(() => {
  if (server) server.kill();
  try {
    rmSync(DB, { force: true });
    rmSync(`${DB}-wal`, { force: true });
    rmSync(`${DB}-shm`, { force: true });
  } catch { /* 무시 */ }
});

describe("VS-4B 실대화 회귀", () => {
  it("인사말은 매도 제안이 아니다", async () => {
    const t = await say("안녕하세요");
    const r = await zip(t);
    assert.equal(r.status, 200);
    assert.equal(r.body.bubble_message_id, null);
    const all = await conditions();
    assert.ok(!condOf(all, "매도 제안가"), "입장 인사말이 매도 제안가로 기록되면 안 된다");
  });
  it("3.9억 제안을 매수 희망가로 기록한다", async () => {
    const t = await say("39000만원에 합시다");
    const r = await zip(t);
    assert.equal(r.status, 201);
    const all = await conditions();
    assert.equal(condOf(all, "매수 희망가").value, "39,000만원");
    assert.equal(condOf(all, "최초가").value, "39,000만원");
  });
  it("AI 수락은 매도 제안가로 기록된다", async () => {
    const t = await say("39000만원에 합시다");
    const ai = await invokeAgent(t);
    const r = await zip(ai);
    assert.equal(r.status, 201);
    const all = await conditions();
    assert.equal(condOf(all, "매도 제안가").value, "39,000만원");
  });
  it("3.85억 재협의는 변경 이력을 남긴다", async () => {
    const t = await say("38500만원에 합시다");
    const r = await zip(t);
    assert.equal(r.status, 201);
    const all = await conditions();
    assert.equal(condOf(all, "매수 희망가").value, "38,500만원");
    const ai = await invokeAgent(t);
    const z = await zip(ai);
    assert.equal(z.status, 201);
    const all2 = await conditions();
    assert.equal(condOf(all2, "매도 제안가").value, "38,500만원");
  });
  it("계약금 10%는 현재 협상가 기준으로 계산된다", async () => {
    const t = await say("계약금 10%로 합시다");
    const r = await zip(t);
    assert.equal(r.status, 201);
    const all = await conditions();
    // 38,500만원의 10% = 3,850만원. 3,900만원이면 오계산이다.
    assert.equal(condOf(all, "계약금").value, "3,850만원");
  });
  it("내일 방문 제안을 기록한다", async () => {
    const t = await say("내일 오후 2시에 방문하고 싶어요");
    const r = await zip(t);
    assert.equal(r.status, 201);
    const v = await api(`/api/rooms/${room}/visits`, {}, HUMAN);
    assert.equal(v.status, 200);
    assert.equal(v.body.length, 1);
    assert.equal(v.body[0].proposed_by, "human");
    const all = await conditions();
    assert.ok(condOf(all, "방문일").value);
  });
  it("AI 답 트리거에도 방문 행이 남는다", async () => {
    const t = await say("모레 오후 2시에 방문하고 싶어요");
    const ai = await invokeAgent(t);
    await zip(ai);
    const v = await api(`/api/rooms/${room}/visits`, {}, HUMAN);
    assert.equal(v.status, 200);
    assert.equal(v.body.length, 2);
  });
  it("잔금일과 입주 월을 기록하고 불일치를 안내한다", async () => {
    const { m } = kstBase();
    const nm = m % 12 + 1;
    const t1 = await say("잔금은 다음달 15일로 해주세요");
    const r1 = await zip(t1);
    assert.equal(r1.status, 201);
    const all1 = await conditions();
    const bal = condOf(all1, "잔금일");
    assert.ok(bal && bal.value.includes(`${nm}월`) && bal.value.includes("15일"));
    const { y } = kstBase();
    const t2 = await say("입주는 내년 2월에 하고 싶어요");
    const r2 = await zip(t2);
    assert.equal(r2.status, 201);
    const all2 = await conditions();
    const mv = condOf(all2, "입주일");
    assert.ok(mv, "입주일이 기록되어야 한다");
    assert.equal(mv.value, `${y + 1}년 2월`);
    const list = await api(`/api/rooms/${room}/messages`, {}, HUMAN);
    const bubbles = list.body.filter((x) => x.author_type === "assistant");
    const last = bubbles[bubbles.length - 1];
    assert.ok(last.text.includes("인도일"), "잔금일과 입주 월이 다르면 인도일 확인을 안내해야 한다");
  });
  it("사용자가 매수 희망가를 확인한다", async () => {
    const r = await api(`/api/rooms/${room}/conditions/confirm`, {
      method: "POST", body: JSON.stringify({ name: "매수 희망가" }),
    }, HUMAN);
    assert.equal(r.status, 200);
  });
});
