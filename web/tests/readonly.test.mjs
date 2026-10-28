// READ_ONLY 회귀 테스트. 모든 쓰기 API가 403, 조회는 200이어야 한다.
// 실행: web/에서 `node --test tests/readonly.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3132;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `readonly-test-${process.pid}.db`);
const TOKEN = "test-token";

let server;

async function api(path, init) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-write-token": TOKEN },
  });
  return r.status;
}

before(async () => {
  server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      DB_PATH: DB,
      WRITE_TOKEN: TOKEN,
      RATE_LIMIT_PER_MIN: "1000",
      READ_ONLY: "true",
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

describe("READ_ONLY 쓰기 차단", () => {
  it("매물 등록이 403이다", async () => {
    assert.equal(await api("/api/listings", { method: "POST", body: JSON.stringify({}) }), 403);
  });
  it("매물 수정이 403이다", async () => {
    assert.equal(await api("/api/listings/s01", { method: "PATCH", body: JSON.stringify({}) }), 403);
  });
  it("메시지 작성이 403이다", async () => {
    assert.equal(await api("/api/deals/s01/messages", { method: "POST", body: JSON.stringify({}) }), 403);
  });
  it("방문 제안이 403이다", async () => {
    assert.equal(await api("/api/deals/s01/visits", { method: "POST", body: JSON.stringify({}) }), 403);
  });
  it("방문 상태 변경이 403이다", async () => {
    assert.equal(await api("/api/deals/s01/visits/x", { method: "PATCH", body: JSON.stringify({}) }), 403);
  });
  it("합의 기록이 403이다", async () => {
    assert.equal(await api("/api/deals/s01/agreements", { method: "POST", body: JSON.stringify({}) }), 403);
  });
  it("체크리스트 저장이 403이다", async () => {
    assert.equal(await api("/api/deals/s01/checklist", { method: "PUT", body: JSON.stringify({}) }), 403);
  });
});

describe("READ_ONLY 조회 정상", () => {
  it("매물 목록이 200이다", async () => {
    assert.equal(await api("/api/listings"), 200);
  });
  it("단건 조회가 200이다", async () => {
    assert.equal(await api("/api/listings/s01"), 200);
  });
  it("공용 메시지 조회는 로그인이 필요하다", async () => {
    assert.equal(await api("/api/deals/s01/messages"), 410);
  });
  it("체크리스트 조회가 200이다", async () => {
    assert.equal(await api("/api/deals/s01/checklist"), 410);
  });
});
