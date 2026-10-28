// M1-A 권한 API 테스트. supabase 모드에서 401·403·정상을 HTTP로 검증한다.
// 실행: web/에서 `npm run build` 후 `node --test tests/m1auth.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3133;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `m1auth-test-${process.pid}.db`);
const TOKEN = "test-token";
const SECRET = "m1-test-secret";
const EXP = Math.floor(Date.now() / 1000) + 3600;

const ownerTok = mintTestToken("u-owner", "집주인", "landlord", SECRET, EXP);
const tenantTok = mintTestToken("u-tenant", "세입자", "tenant", SECRET, EXP);
// 위조: 메타데이터 역할 admin. 서버는 DB 역할(tenant)을 내려야 한다.
const forgedTok = mintTestToken("u-tenant", "세입자", "admin", SECRET, EXP);

let server;

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

function listingPayload(title = "권한방") {
  return {
    title, address: "서울 관악구 권한로 1 (가상)", tradeType: "월세",
    deposit: 500, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
    options: [], description: "", publisher: "집주인",
  };
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
});

after(() => {
  if (server) server.kill();
  try {
    rmSync(DB, { force: true });
    rmSync(`${DB}-wal`, { force: true });
    rmSync(`${DB}-shm`, { force: true });
  } catch { /* 무시 */ }
});

describe("M1-A 인증 없음 401", () => {
  it("매물 등록이 401이다", async () => {
    assert.equal((await api("/api/listings", { method: "POST", body: JSON.stringify(listingPayload()) })).status, 401);
  });
  it("메시지 작성이 401이다", async () => {
    const r = await api("/api/deals/s01/messages", { method: "POST", body: JSON.stringify({ text: "hi" }) });
    assert.equal(r.status, 401);
  });
  it("방문·합의·체크 저장이 401이다", async () => {
    assert.equal((await api("/api/deals/s01/visits", { method: "POST", body: JSON.stringify({ date: "2026-11-20", time: "14:00" }) })).status, 401);
    assert.equal((await api("/api/deals/s01/agreements", { method: "POST", body: JSON.stringify({ text: "합의" }) })).status, 401);
    assert.equal((await api("/api/deals/s01/checklist", { method: "PUT", body: JSON.stringify({ checks: {} }) })).status, 401);
  });
  it("조회는 토큰 없이 200이다", async () => {
    assert.equal((await api("/api/listings")).status, 200);
    assert.equal((await api("/api/deals/s01/messages")).status, 200);
  });
});

describe("M1-A 소유자 403과 정상 흐름", () => {
  it("소유자 등록·수정 성공, 타인 수정 403", async () => {
    const created = await api("/api/listings", { method: "POST", body: JSON.stringify(listingPayload()) }, ownerTok);
    assert.equal(created.status, 201);
    assert.equal(created.body.ownerId, "u-owner");
    const id = created.body.id;
    const mine = await api(`/api/listings/${id}`, { method: "PATCH", body: JSON.stringify({ title: "수정됨" }) }, ownerTok);
    assert.equal(mine.status, 200);
    const nope = await api(`/api/listings/${id}`, { method: "PATCH", body: JSON.stringify({ title: "남의 수정" }) }, tenantTok);
    assert.equal(nope.status, 403);
    const seed = await api("/api/listings/s01", { method: "PATCH", body: JSON.stringify({ title: "x" }) }, ownerTok);
    assert.equal(seed.status, 404);
  });

  it("소유자는 landlord, 타인은 tenant, 위조 admin도 tenant", async () => {
    const created = await api("/api/listings", { method: "POST", body: JSON.stringify(listingPayload("역할방")) }, ownerTok);
    const id = created.body.id;
    const m1 = await api(`/api/deals/${id}/messages`, { method: "POST", body: JSON.stringify({ text: "주인 글" }) }, ownerTok);
    assert.equal(m1.status, 201);
    const m2 = await api(`/api/deals/${id}/messages`, { method: "POST", body: JSON.stringify({ text: "위조 글" }) }, forgedTok);
    assert.equal(m2.status, 201);
    const list = await api(`/api/deals/${id}/messages`);
    const byOwner = list.body.find((m) => m.id === m1.body.id);
    const byForged = list.body.find((m) => m.id === m2.body.id);
    assert.equal(byOwner.role, "landlord");
    assert.equal(byForged.role, "tenant");
  });
});

describe("M1-A auth 보조", () => {
  it("me는 토큰 신원을 돌린다", async () => {
    const okRes = await api("/api/auth/me", {}, ownerTok);
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.userId, "u-owner");
    assert.equal((await api("/api/auth/me")).status, 401);
  });
  it("login은 Supabase 미설정 시 503이다", async () => {
    const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.c", password: "x" }) }, ownerTok);
    assert.equal(r.status, 503);
  });
});
