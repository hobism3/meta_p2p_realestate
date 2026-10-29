// Agent 계약 단위 테스트. 네트워크·서버 없이 순수 함수만 검증한다.
// 실행: web/에서 `node --test tests/agent.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAgentInput, resolveModel, resolveProvider } from "../lib/agent-service.ts";
import {
  callMeta,
  META_DEFAULT_MODEL,
  META_MAX_TOKENS,
  META_TIMEOUT_MS,
  parseChatResponse,
} from "../lib/meta.ts";

const HISTORY = [
  { author_type: "human", author: "사람", text: "매매가 얼마인가요?" },
  { author_type: "demo_agent", author: "AI 매도자", text: "가격은 45,000만원입니다." },
];

describe("provider 결정", () => {
  it("기본은 mock이다", async () => {
    delete process.env.AGENT_PROVIDER;
    assert.equal(resolveProvider(), "mock");
  });
  it("모델명을 구분한다", async () => {
    delete process.env.MODEL_MODEL;
    assert.equal(resolveModel("mock"), "mock-v1");
    assert.equal(resolveModel("meta"), META_DEFAULT_MODEL);
  });
  it("호출 예산이 고정돼 있다", async () => {
    assert.equal(META_MAX_TOKENS, 1024);
    assert.equal(META_TIMEOUT_MS, 20000);
  });
});

describe("입력 계약", () => {
  it("매물 사실과 규칙과 대화를 담는다", async () => {
    const input = buildAgentInput(
      "AI 매도자",
      "AI 매도자",
      { 가격: "45,000만원", 입주일: "협의 가능" },
      { 가격: { min: 40500, max: 45000, unit: "만원" } },
      HISTORY,
    );
    assert.ok(input.system.includes("45,000만원"));
    assert.ok(input.system.includes("지어내기 금지"));
    assert.ok(input.system.includes("확정"));
    assert.deepEqual(input.messages, [
      { role: "user", content: "매매가 얼마인가요?" },
      { role: "assistant", content: "가격은 45,000만원입니다." },
    ]);
  });
  it("대화는 최근 12건만 쓴다", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ author_type: "human", author: "h", text: `m${i}` }));
    const input = buildAgentInput("AI 매도자", "AI 매도자", {}, {}, many);
    assert.equal(input.messages.length, 12);
    assert.equal(input.messages[0].content, "m8");
  });
});

describe("응답 해석", () => {
  it("문자열 본문을 읽는다", async () => {
    const r = parseChatResponse({ choices: [{ message: { content: "  안녕  " } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    assert.deepEqual(r, { text: "안녕", usage: { inputTokens: 10, outputTokens: 5 } });
  });
  it("배열 파트를 합친다", async () => {
    const r = parseChatResponse({ choices: [{ message: { content: [{ text: "가" }, { text: "나" }] } }] });
    assert.equal(r.text, "가나");
    assert.deepEqual(r.usage, { inputTokens: 0, outputTokens: 0 });
  });
  it("빈 본문·없는 choices는 null이다", async () => {
    assert.equal(parseChatResponse({ choices: [{ message: { content: "  " } }] }), null);
    assert.equal(parseChatResponse({}), null);
    assert.equal(parseChatResponse(null), null);
  });
});

describe("meta 호출", () => {
  it("키가 없으면 네트워크에 닿지 않는다", async () => {
    delete process.env.MODEL_API_KEY;
    let called = false;
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { fetchImpl: (async () => { called = true; throw new Error("must not call"); }) },
    );
    assert.deepEqual(r, { ok: false, kind: "no_key", latencyMs: 0 });
    assert.equal(called, false);
  });
  it("Bearer 키로 호출하고 본문을 다듬는다", async () => {
    let seen = {};
    const r = await callMeta(
      { system: "s", messages: [{ role: "user", content: "hi" }], maxTokens: 10, timeoutMs: 1000 },
      {
        key: "k",
        fetchImpl: (async (url, init) => {
          seen = { url, auth: init.headers.Authorization, model: JSON.parse(init.body).model };
          return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: " hi " } }] }) };
        }),
      },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(seen, { url: "https://api.meta.ai/v1/chat/completions", auth: "Bearer k", model: "muse-spark-1.3" });
  });
  it("http 오류를 구분한다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { key: "k", fetchImpl: (async () => ({ ok: false, status: 429, json: async () => ({}) })) },
    );
    assert.deepEqual({ ok: r.ok, kind: r.kind, status: r.status }, { ok: false, kind: "http", status: 429 });
  });
  it("네트워크 실패를 구분한다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { key: "k", fetchImpl: (async () => { throw new Error("boom"); }) },
    );
    assert.equal(r.kind, "network");
  });
  it("타임아웃을 구분한다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 50 },
      {
        key: "k",
        fetchImpl: (url, init) => new Promise((_, rej) => {
          init.signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
      },
    );
    assert.equal(r.kind, "timeout");
  });
  it("오류 envelope 메시지를 살린다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { key: "k", fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({ error: { message: "quota exceeded" } }) })) },
    );
    assert.equal(r.kind, "bad_response");
    assert.equal(r.detail, "quota exceeded");
  });
  it("http 오류 envelope 메시지를 살린다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { key: "k", fetchImpl: (async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "slow down" } }) })) },
    );
    assert.equal(r.kind, "http");
    assert.equal(r.detail, "slow down");
  });
  it("빈 choices는 모양을 남긴다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { key: "k", fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({ id: "x", choices: [] }) })) },
    );
    assert.equal(r.kind, "bad_response");
    assert.equal(r.detail, "keys:id,choices choices:0");
  });
  it("빈 본문은 empty로 남긴다", async () => {
    const r = await callMeta(
      { system: "s", messages: [], maxTokens: 10, timeoutMs: 1000 },
      { key: "k", fetchImpl: (async () => ({ ok: true, status: 200, json: async () => null })) },
    );
    assert.equal(r.kind, "bad_response");
    assert.equal(r.detail, "empty");
  });
});
