import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { mintTestToken } from "../lib/auth.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = 3144;
const MOCK_MODEL_PORT = 3145;
const BASE = "http://127.0.0.1:" + API_PORT;
const SECRET = "ziptalk-length-test-secret";
const TOKEN = "ziptalk-test-write-token";
const DB = join(ROOT, "data", "ziptalk-length-test-" + process.pid + ".db");
const USER = mintTestToken("ziptalk-length-user", "테스터", "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);

let app, mock;
let roomId;
let calls = 0;
let mode = "length";
let lastRequest;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + USER,
      "x-write-token": TOKEN,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function say(text) {
  const r = await api("/api/rooms/" + roomId + "/messages", { method: "POST", body: { text } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

async function analyze(trigger) {
  return api("/api/rooms/" + roomId + "/ziptalk/invoke", {
    method: "POST", body: { trigger_message_id: trigger },
  });
}

before(async () => {
  mock = createServer(async (req, res) => {
    if (req.url !== "/chat/completions" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    calls++;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    lastRequest = JSON.parse(raw);
    const finish_reason = mode === "length" ? "length" : "stop";
    const content = mode === "valid-silent"
      ? JSON.stringify({ conditions: [], intervene: false, bubble: null })
      : null;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "synthetic-completion",
      choices: [{ finish_reason, message: { role: "assistant", content, refusal: null } }],
      usage: { prompt_tokens: 850, completion_tokens: mode === "length" ? 1536 : 0 },
    }));
  });
  await new Promise((resolve, reject) => {
    mock.once("error", reject);
    mock.listen(MOCK_MODEL_PORT, "127.0.0.1", resolve);
  });

  app = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(API_PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: "",
      DB_PATH: DB,
      AGENT_PROVIDER: "meta",
      MODEL_API_BASE: "http://127.0.0.1:" + MOCK_MODEL_PORT,
      MODEL_API_KEY: "synthetic-not-real",
      MODEL_MODEL: "synthetic-muse",
      WRITE_TOKEN: TOKEN,
      SUPABASE_JWT_SECRET: SECRET,
      RATE_LIMIT_PER_MIN: "1000",
      READ_ONLY: "false",
    },
    stdio: "ignore",
  });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (app.exitCode !== null) throw new Error("Next.js exited early: " + app.exitCode);
    try {
      const health = await fetch(BASE + "/api/health");
      if (health.ok) { ready = true; break; }
    } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  assert.ok(ready, "Next.js test server did not become ready");
  const room = await api("/api/deals/s16/rooms", { method: "POST", body: {} });
  assert.equal(room.status, 201, JSON.stringify(room.body));
  roomId = room.body.id;
});

after(async () => {
  if (app) {
    app.kill();
    await new Promise((resolve) => {
      if (app.exitCode !== null) return resolve();
      app.once("exit", resolve);
      setTimeout(resolve, 2500);
    });
  }
  if (mock) await new Promise(resolve => mock.close(resolve));
  for (const suffix of ["", "-wal", "-shm"]) {
    try { rmSync(DB + suffix, { force: true }); } catch { /* ignore */ }
  }
});

describe("Meta 응답 길이 초과: 안전한 집톡이 복구", () => {
  it("실제 Meta 없이 length + content:null을 재현하고 규칙 기반 분석으로 성공 처리한다", async () => {
    const id = await say("보증금을 3000만원으로 올리고, 월세 60만원으로 조정해 주세요.");
    const r = await analyze(id);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.provider, "mock");
    assert.equal(r.body.model, "ziptalk-v1");
    assert.equal(r.body.fallback, "meta_truncated");
    assert.ok(r.body.applied >= 1);
    assert.equal(calls, 1, "one paid call per trigger, never an automatic retry");
    assert.equal(lastRequest.max_tokens, 1536);
    assert.ok(lastRequest.messages.length <= 9, "history capped at 8 + system");

    const conditions = await api("/api/rooms/" + roomId + "/conditions");
    assert.equal(conditions.status, 200);
    const c = conditions.body.conditions.find(c => c.name === "임차 희망 조건");
    assert.ok(c, "grounded rent request should be recorded");
    assert.match(c.value, /3,000/);
    assert.match(c.value, /60/);
    assert.notEqual(c.status, "confirmed");

    const database = new DatabaseSync(DB, { readOnly: true });
    try {
      const run = database.prepare("SELECT status, provider, model, usage_json FROM agent_runs WHERE agent_type = 'ziptalk' ORDER BY created_at DESC LIMIT 1").get();
      assert.equal(run.status, "done");
      assert.equal(run.provider, "mock");
      assert.equal(run.model, "ziptalk-v1");
      assert.equal(JSON.parse(run.usage_json).fallback, "meta_truncated");
    } finally { database.close(); }

    const again = await analyze(id);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.fallback, "meta_truncated");
    assert.equal(calls, 1, "completed run must be idempotent");
  });

  it("stop + content:null 은 length와 구분하고 내부 응답 구조를 노출하지 않는다", async () => {
    mode = "invalid";
    const id = await say("고양이 키워도 되나요?");
    const r = await analyze(id);
    assert.equal(r.status, 502);
    assert.match(r.body.error, /응답 형식 오류/);
    assert.doesNotMatch(r.body.error, /keys:|choices:|content:null|finish:/);
    assert.equal(calls, 2);
  });
  it("모델이 방문 시간을 누락해도 원문 '내일 오후 세시'로 15:00 제안과 visits 행을 생성한다", async () => {
    mode = "valid-silent";
    const request = await say("오후 3시는 괜찮나요?");
    const q = await analyze(request);
    assert.equal(q.status, 200, JSON.stringify(q.body));
    const before = await api("/api/rooms/" + roomId + "/visits");
    assert.ok(before.body.every((x) => x.visit_time !== "15:00"), "질문만으로 제안 생성 금지");

    const id = randomUUID();
    const database = new DatabaseSync(DB);
    try {
      database.prepare("INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
        id, "s16", "AI 임대인", "", "agent:synthetic", "demo_agent", roomId,
        "테라스 함께 보시게 내일 오후 세시에 여유롭게 뵐게요", new Date().toISOString(),
      );
    } finally { database.close(); }
    const r = await analyze(id);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.provider, "meta");
    const c = await api("/api/rooms/" + roomId + "/conditions");
    const visit = c.body.conditions.find((x) => x.name === "방문일");
    assert.ok(visit);
    assert.match(visit.value, /오후 3시/);
    assert.equal(visit.status, "proposed");
    assert.ok(JSON.parse(visit.source_msg_ids).includes(id));
    const visits = await api("/api/rooms/" + roomId + "/visits");
    assert.ok(visits.body.some((v) => v.visit_time === "15:00" && v.status === "제안됨"));
  });

});
