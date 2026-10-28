// API+DB 통합 테스트. 프로덕션 서버를 띄워 실제 HTTP로 검증한다.
// 실행: web/에서 `npm run build` 후 `DB_PATH` 격리 상태로 `node --test tests/api.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = 3121;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `directhome-test-${process.pid}.db`);

let server;

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* 대기 */ }
    await new Promise((s) => setTimeout(s, 1000));
  }
  throw new Error("서버 기동 실패");
}

const TOKEN = "test-token";

async function api(path, init, withToken = true) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(withToken ? { "x-write-token": TOKEN } : {}),
    },
  });
  const body = await r.json();
  return { status: r.status, body };
}

async function raw(path, init) {
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* 빈 응답 */ }
  return { status: r.status, body };
}

before(async () => {
  server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    env: { ...process.env, DB_PATH: DB, WRITE_TOKEN: TOKEN, RATE_LIMIT_PER_MIN: "1000", ALLOW_DEV_AUTH: "true" },
    stdio: "ignore",
  });
  await waitUp();
});

after(() => {
  if (server) server.kill();
  try {
    rmSync(DB, { force: true });
    rmSync(`${DB}-wal`, { force: true });
    rmSync(`${DB}-shm`, { force: true });
  } catch { /* 무시 */ }
});

describe("매물 API", () => {
  it("시드 24건(전월세 20 + 매매 4)을 반환한다", async () => {
    const { status, body } = await api("/api/listings");
    assert.equal(status, 200);
    assert.equal(body.length, 24);
    assert.ok(body.some((l) => l.tradeType === "매매" && l.salePrice > 0));
  });

  it("등록 성공 시 201과 uuid를 준다", async () => {
    const payload = {
      title: "테스트방", address: "서울 관악구 테스트로 1 (가상)", tradeType: "월세",
      deposit: 1000, rent: 60, fee: 5, area: 23, moveIn: "2026-12-01",
      options: [], description: "", publisher: "테스터",
    };
    const r1 = await api("/api/listings", { method: "POST", body: JSON.stringify(payload) });
    const r2 = await api("/api/listings", { method: "POST", body: JSON.stringify(payload) });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.notEqual(r1.body.id, r2.body.id);
  });

  it("매매 등록은 매매가를 별도 필드로 저장한다", async () => {
    const r = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "매매방", address: "서울 관악구 매매로 1 (가상)", tradeType: "매매",
        deposit: 0, rent: 0, salePrice: 85000, fee: 5, area: 59, moveIn: "2026-12-01",
        options: [], description: "", publisher: "테스터",
      }),
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.tradeType, "매매");
    assert.equal(r.body.salePrice, 85000);
    assert.equal(r.body.deposit, 0);
    assert.equal(r.body.rent, 0);
  });

  it("매매가 없거나 거래유형이 틀리면 400이다", async () => {
    const base = {
      title: "매매방", address: "서울 관악구 매매로 1 (가상)", tradeType: "매매",
      deposit: 0, rent: 0, fee: 5, area: 59, moveIn: "2026-12-01",
      options: [], description: "", publisher: "테스터",
    };
    const noPrice = await api("/api/listings", { method: "POST", body: JSON.stringify(base) });
    assert.equal(noPrice.status, 400);
    const badType = await api("/api/listings", {
      method: "POST", body: JSON.stringify({ ...base, tradeType: "교환", salePrice: 100 }),
    });
    assert.equal(badType.status, 400);
  });

  it("필수 누락은 400이다", async () => {
    const { status } = await api("/api/listings", { method: "POST", body: JSON.stringify({}) });
    assert.equal(status, 400);
  });

  it("시드 매물 수정은 404다", async () => {
    const { status } = await api("/api/listings/s01", { method: "PATCH", body: JSON.stringify({ title: "x" }) });
    assert.equal(status, 404);
  });

  it("단일 조회가 된다", async () => {
    const seed = await api("/api/listings/s01");
    assert.equal(seed.status, 200);
    assert.equal(seed.body.editable, false);
    const created = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "단건", address: "서울 관악구 단건로 1 (가상)", tradeType: "월세",
        deposit: 500, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
        options: [], description: "", publisher: "테스터",
      }),
    });
    const one = await api(`/api/listings/${created.body.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.editable, true);
    const nope = await api("/api/listings/nope");
    assert.equal(nope.status, 404);
  });

  it("깨진 JSON은 400이다", async () => {
    const { status, body } = await raw("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-write-token": TOKEN },
      body: "{깨짐",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "JSON 형식 오류");
  });

  it("토큰 없이는 쓰기가 401이다", async () => {
    const { status } = await api("/api/listings", { method: "POST", body: JSON.stringify({}) }, false);
    assert.equal(status, 401);
  });

  it("PATCH 불변식을 지킨다", async () => {
    const created = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "불변", address: "서울 관악구 불변로 1 (가상)", tradeType: "월세",
        deposit: 500, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
        options: [], description: "", publisher: "테스터",
      }),
    });
    const bad1 = await api(`/api/listings/${created.body.id}`, {
      method: "PATCH", body: JSON.stringify({ area: 0 }),
    });
    assert.equal(bad1.status, 400);
    const bad2 = await api(`/api/listings/${created.body.id}`, {
      method: "PATCH", body: JSON.stringify({ rent: 0 }),
    });
    assert.equal(bad2.status, 400);
    const good = await api(`/api/listings/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "불변 수정", address: "서울 관악구 바뀐로 2 (가상)",
        publisher: "바뀐이", options: ["에어컨"],
      }),
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.title, "불변 수정");
    assert.equal(good.body.address, "서울 관악구 바뀐로 2 (가상)");
    assert.deepEqual(good.body.options, ["에어컨"]);
  });

  it("매매가 PATCH가 된다", async () => {
    const created = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "매매불변", address: "서울 관악구 매매로 2 (가상)", tradeType: "매매",
        deposit: 0, rent: 0, salePrice: 50000, fee: 5, area: 40, moveIn: "2026-12-01",
        options: [], description: "", publisher: "테스터",
      }),
    });
    const bad1 = await api(`/api/listings/${created.body.id}`, {
      method: "PATCH", body: JSON.stringify({ salePrice: 0 }),
    });
    assert.equal(bad1.status, 400);
    const good = await api(`/api/listings/${created.body.id}`, {
      method: "PATCH", body: JSON.stringify({ salePrice: 52000 }),
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.salePrice, 52000);
  });
});

describe("거래방 API", () => {
  it("양측 메시지를 저장·조회한다", async () => {
    const m1 = await api("/api/deals/s01/messages", {
      method: "POST",
      body: JSON.stringify({ author: "집주인", role: "landlord", text: "보증금 1000입니다" }),
    });
    const m2 = await api("/api/deals/s01/messages", {
      method: "POST",
      body: JSON.stringify({ author: "세입자", role: "tenant", text: "900에 해주세요" }),
    });
    assert.equal(m1.status, 201);
    assert.equal(m2.status, 201);
    const { status, body } = await api("/api/deals/s01/messages");
    assert.equal(status, 200);
    assert.ok(body.some((m) => m.role === "landlord"));
    assert.ok(body.some((m) => m.role === "tenant"));
  });

  it("잘못된 역할은 400이다", async () => {
    const { status } = await api("/api/deals/s01/messages", {
      method: "POST",
      body: JSON.stringify({ author: "x", role: "중개인", text: "hi" }),
    });
    assert.equal(status, 400);
  });

  it("방문 일정 제안·수락이 된다", async () => {
    const created = await api("/api/deals/s01/visits", {
      method: "POST",
      body: JSON.stringify({ date: "2026-11-20", time: "14:00" }),
    });
    assert.equal(created.status, 201);
    const patched = await api(`/api/deals/s01/visits/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "수락됨" }),
    });
    assert.equal(patched.status, 200);
    const { body } = await api("/api/deals/s01/visits");
    assert.ok(body.some((v) => v.id === created.body.id && v.status === "수락됨"));
  });

  it("잘못된 상태·형식은 400이다", async () => {
    const s1 = await api("/api/deals/s01/visits", {
      method: "POST",
      body: JSON.stringify({ date: "내일", time: "두시" }),
    });
    assert.equal(s1.status, 400);
  });

  it("합의 로그를 저장·조회한다", async () => {
    const c = await api("/api/deals/s01/agreements", {
      method: "POST",
      body: JSON.stringify({ text: "보증금 1000, 월세 65 합의" }),
    });
    assert.equal(c.status, 201);
    const { body } = await api("/api/deals/s01/agreements");
    assert.ok(body.some((a) => a.text.includes("보증금 1000")));
  });

  it("체크리스트를 저장·조회한다", async () => {
    const put = await api("/api/deals/s01/checklist", {
      method: "PUT",
      body: JSON.stringify({ checks: { "신분 확인": "done" } }),
    });
    assert.equal(put.status, 200);
    const { body } = await api("/api/deals/s01/checklist");
    assert.equal(body["신분 확인"], "done");
  });

  it("없는 매물은 404다", async () => {
    const { status } = await api("/api/deals/nope/messages");
    assert.equal(status, 404);
  });
});
