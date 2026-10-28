// M1-B 독립 거래방 테스트. A(소유자)-B, A-C 방 분리·401·403·공유를 HTTP로 검증한다.
// 실행: web/에서 `npm run build` 후 `node --test tests/m1brooms.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3134;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `m1brooms-test-${process.pid}.db`);
const TOKEN = "test-token";
const SECRET = "m1b-test-secret";
const EXP = Math.floor(Date.now() / 1000) + 3600;

const A = mintTestToken("u-seller-a", "매도자A", "landlord", SECRET, EXP);
const B = mintTestToken("u-buyer-b", "매수자B", "tenant", SECRET, EXP);
const C = mintTestToken("u-buyer-c", "매수자C", "tenant", SECRET, EXP);

let server;
let listingId;
let roomAB;
let roomAC;

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
  const created = await api("/api/listings", {
    method: "POST",
    body: JSON.stringify({
      title: "방분리 매물", address: "서울 관악구 분리로 1 (가상)", tradeType: "월세",
      deposit: 500, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
      options: [], description: "", publisher: "매도자A",
    }),
  }, A);
  assert.equal(created.status, 201);
  listingId = created.body.id;
  const ab = await api(`/api/deals/${listingId}/rooms`, { method: "POST", body: JSON.stringify({}) }, B);
  assert.equal(ab.status, 201);
  roomAB = ab.body.id;
  const ac = await api(`/api/deals/${listingId}/rooms`, { method: "POST", body: JSON.stringify({}) }, C);
  assert.equal(ac.status, 201);
  roomAC = ac.body.id;
  assert.notEqual(roomAB, roomAC);
});

after(() => {
  if (server) server.kill();
  try {
    rmSync(DB, { force: true });
    rmSync(`${DB}-wal`, { force: true });
    rmSync(`${DB}-shm`, { force: true });
  } catch { /* 무시 */ }
});

describe("M1-B 방 분리", () => {
  it("A는 두 방을 보고 B·C는 자기 방만 본다", async () => {
    const a = await api(`/api/deals/${listingId}/rooms`, {}, A);
    assert.equal(a.status, 200);
    assert.equal(a.body.length, 2);
    const b = await api(`/api/deals/${listingId}/rooms`, {}, B);
    assert.equal(b.status, 200);
    assert.equal(b.body.length, 1);
    assert.equal(b.body[0].id, roomAB);
    const c = await api(`/api/deals/${listingId}/rooms`, {}, C);
    assert.equal(c.body.length, 1);
    assert.equal(c.body[0].id, roomAC);
  });

  it("무인증은 401이다", async () => {
    assert.equal((await api(`/api/rooms/${roomAB}/messages`)).status, 401);
    assert.equal((await api(`/api/rooms/${roomAB}/messages`, { method: "POST", body: JSON.stringify({ text: "x" }) })).status, 401);
  });

  it("A-B 대화는 C가 조회·수정 불가(403)", async () => {
    const m = await api(`/api/rooms/${roomAB}/messages`, { method: "POST", body: JSON.stringify({ text: "B 문의" }) }, B);
    assert.equal(m.status, 201);
    assert.equal((await api(`/api/rooms/${roomAB}/messages`, {}, C)).status, 403);
    assert.equal((await api(`/api/rooms/${roomAB}/messages`, { method: "POST", body: JSON.stringify({ text: "C 끼어듦" }) }, C)).status, 403);
    const v = await api(`/api/rooms/${roomAB}/visits`, { method: "POST", body: JSON.stringify({ date: "2026-11-20", time: "14:00" }) }, B);
    assert.equal(v.status, 201);
    assert.equal((await api(`/api/rooms/${roomAB}/visits/${v.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "수락됨" }) }, C)).status, 403);
  });

  it("정상 참여자는 공유하고 새로고침해도 유지된다", async () => {
    const a1 = await api(`/api/rooms/${roomAB}/messages`, {}, A);
    assert.ok(a1.body.some((m) => m.text === "B 문의"));
    const m2 = await api(`/api/rooms/${roomAB}/messages`, { method: "POST", body: JSON.stringify({ text: "A 답변" }) }, A);
    assert.equal(m2.status, 201);
    const b1 = await api(`/api/rooms/${roomAB}/messages`, {}, B);
    assert.ok(b1.body.some((m) => m.text === "A 답변"));
    const b2 = await api(`/api/rooms/${roomAB}/messages`, {}, B);
    assert.deepEqual(b2.body.map((m) => m.id).sort(), b1.body.map((m) => m.id).sort());
  });

  it("방 일정·합의·체크가 방 단위로 격리된다", async () => {
    const v = await api(`/api/rooms/${roomAC}/visits`, { method: "POST", body: JSON.stringify({ date: "2026-11-21", time: "15:00" }) }, C);
    assert.equal(v.status, 201);
    const okPatch = await api(`/api/rooms/${roomAC}/visits/${v.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "수락됨" }) }, A);
    assert.equal(okPatch.status, 200);
    const other = await api(`/api/rooms/${roomAB}/visits`, {}, B);
    assert.ok(other.body.every((x) => x.id !== v.body.id));
    const ag = await api(`/api/rooms/${roomAC}/agreements`, { method: "POST", body: JSON.stringify({ text: "AC 합의" }) }, C);
    assert.equal(ag.status, 201);
    assert.equal((await api(`/api/rooms/${roomAB}/agreements`, {}, B)).body.length, 0);
    const ck = await api(`/api/rooms/${roomAC}/checklist`, { method: "PUT", body: JSON.stringify({ checks: { "등기 확인": "done" } }) }, A);
    assert.equal(ck.status, 200);
    assert.equal((await api(`/api/rooms/${roomAC}/checklist`, {}, C)).body["등기 확인"], "done");
    assert.equal((await api(`/api/rooms/${roomAB}/checklist`, {}, B)).body["등기 확인"], undefined);
  });

  it("공용 스레드는 폐쇄됐다", async () => {
    const pub = await api(`/api/deals/${listingId}/messages`, {}, B);
    assert.equal(pub.status, 410);
    assert.equal(pub.body.error, "종료된 거래방입니다. 독립 거래방(/rooms)을 이용하세요.");
    assert.equal(pub.status, 410);
  });
});
