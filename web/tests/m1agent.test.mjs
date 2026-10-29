// AI-3·AI-5 순수 테스트 + AI-2·AI-4 HTTP 테스트.
// 실행: web/에서 `npm run build` 후 `node --test tests/m1agent.test.mjs`
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { draftReply } from "../lib/agent.ts";
import { classify, detectChange, detectConflict, extractPriceManwon, hasJudgment } from "../lib/ziptalk.ts";
import { mintTestToken } from "../lib/auth.ts";

const SCENARIO = {
  persona: "신림역 매도자",
  side: "seller",
  facts: { 가격: "보증금 1000만원", 입주일: "2026-12-01", 상태: "수리 완료" },
  negotiable: { 보증금: { min: 900, max: 1000, unit: "만원" } },
};

describe("AI-3 mock 응답", () => {
  it("시나리오 가격에 답한다", async () => {
    const r = draftReply(SCENARIO, "보증금 얼마인가요?");
    assert.ok(r.text.includes("1000만원"));
    assert.equal(r.needsHuman, false);
  });
  it("범위 안 제안은 미확정으로 받는다", async () => {
    const r = draftReply(SCENARIO, "950에 하자고 제안합니다");
    assert.ok(r.proposal && r.proposal.value === 950 && r.proposal.confirmed === false);
  });
  it("범위 밖은 사람 확인을 요청한다", async () => {
    const r = draftReply(SCENARIO, "800에 하자고 제안합니다");
    assert.equal(r.needsHuman, true);
    assert.equal(r.proposal, null);
  });
  it("없는 사실은 만들지 않는다", async () => {
    const r = draftReply(SCENARIO, "주차장 있나요?");
    assert.ok(r.text.includes("시나리오에 없어"));
    assert.equal(r.needsHuman, true);
  });
  it("법률 판단 요청을 거부한다", async () => {
    const r = draftReply(SCENARIO, "특약 문구를 써주세요");
    assert.equal(r.needsHuman, true);
  });
});

describe("AI-5 집톡이 추출·분류", () => {
  it("제안·질문·희망·철회를 구분한다", async () => {
    assert.equal(classify("900에 합시다"), "proposal");
    assert.equal(classify("입주 언제인가요?"), "question");
    assert.equal(classify("남향이었으면 좋겠어요"), "wish");
    assert.equal(classify("제안은 취소합니다"), "withdraw");
  });
  it("가격을 뽑는다", async () => {
    assert.equal(extractPriceManwon("보증금 1억"), 10000);
    assert.equal(extractPriceManwon("900만원希望"), 900);
    assert.equal(extractPriceManwon("가격 문의"), null);
  });
  it("변경·충돌을 원문 근거와 함께 낸다", async () => {
    const ch = detectChange("c1", "1000만원", "900만원으로 하자", "m2");
    assert.deepEqual(ch, { conditionId: "c1", oldValue: "1000만원", newValue: "900만원", msgId: "m2" });
    assert.equal(detectChange("c1", "900만원", "900만원 유지", "m3"), null);
    const cf = detectConflict("보증금", "1000만원 요구", "m1", "900만원 희망", "m2");
    assert.deepEqual(cf, { field: "보증금", sideA: "1000만원", sideB: "900만원", msgRefs: ["m1", "m2"] });
  });
  it("판단 문구를 가려낸다", async () => {
    assert.equal(hasJudgment("이 집은 최고 등급입니다"), true);
    assert.equal(hasJudgment("900만원 제안합니다"), false);
  });
});

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3135;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = join(WEB_ROOT, "data", `m1agent-test-${process.pid}.db`);
const TOKEN = "test-token";
const SECRET = "m1a-test-secret";
const EXP = Math.floor(Date.now() / 1000) + 3600;

const HUMAN = mintTestToken("u-human", "사람", "tenant", SECRET, EXP);
const OWNER = mintTestToken("u-owner2", "주인", "landlord", SECRET, EXP);
const STRANGER = mintTestToken("u-stranger", "타인", "tenant", SECRET, EXP);

let server;
let roomId;
let vs2aListing = "";
let vs2aRoom = "";
let vs2bRoom = "";

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
      ALLOW_DEMO_SETUP: "true",
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
      title: "AI방 매물", address: "서울 관악구 AI로 1 (가상)", tradeType: "월세",
      deposit: 1000, rent: 50, fee: 5, area: 20, moveIn: "2026-12-01",
      options: [], description: "", publisher: "주인",
    }),
  }, OWNER);
  assert.equal(created.status, 201);
  const room = await api(`/api/deals/${created.body.id}/rooms`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
  assert.equal(room.status, 201);
  roomId = room.body.id;
  const setup = await api("/api/demo/scenarios", {
    method: "POST",
    body: JSON.stringify({
      roomId, side: "seller", persona: "신림역 매도자",
      facts: { 가격: "보증금 1000만원", 입주일: "2026-12-01", 상태: "수리 완료" },
      negotiable: { 보증금: { min: 900, max: 1000, unit: "만원" } },
    }),
  }, HUMAN);
  assert.equal(setup.status, 201);
});

after(() => {
  if (server) server.kill();
  try {
    rmSync(DB, { force: true });
    rmSync(`${DB}-wal`, { force: true });
    rmSync(`${DB}-shm`, { force: true });
  } catch { /* 무시 */ }
});

describe("AI-2 작성자 유형 강제", () => {
  it("위조 author_type은 400이다", async () => {
    const r = await api(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "위장", author_type: "assistant" }),
    }, HUMAN);
    assert.equal(r.status, 400);
  });
  it("정상 작성은 human으로 저장된다", async () => {
    const r = await api(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "보증금 얼마인가요?" }),
    }, HUMAN);
    assert.equal(r.status, 201);
    const list = await api(`/api/rooms/${roomId}/messages`, {}, HUMAN);
    const mine = list.body.find((m) => m.id === r.body.id);
    assert.equal(mine.author_type, "human");
  });
});

describe("AI-4 invoke와 루프 가드", () => {
  it("사람 메시지 뒤에 AI 1건이 붙는다", async () => {
    const r = await api(`/api/rooms/${roomId}/agent/invoke`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
    assert.equal(r.status, 201);
    assert.ok(r.body.text.includes("1000만원"));
    const list = await api(`/api/rooms/${roomId}/messages`, {}, HUMAN);
    const ai = list.body.find((m) => m.id === r.body.id);
    assert.equal(ai.author_type, "demo_agent");
    assert.ok(String(ai.author).includes("AI"));
  });
  it("AI 메시지 뒤에는 409로 거부한다", async () => {
    const r = await api(`/api/rooms/${roomId}/agent/invoke`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
    assert.equal(r.status, 409);
  });
  it("비멤버는 403, 무인증은 401이다", async () => {
    assert.equal((await api(`/api/rooms/${roomId}/agent/invoke`, { method: "POST", body: JSON.stringify({}) }, STRANGER)).status, 403);
    assert.equal((await api(`/api/rooms/${roomId}/agent/invoke`, { method: "POST", body: JSON.stringify({}) })).status, 401);
  });
  it("상태 조회가 된다", async () => {
    const r = await api(`/api/rooms/${roomId}/agent/invoke`, {}, HUMAN);
    assert.equal(r.status, 200);
    assert.equal(r.body.agents.length, 1);
  });

  it("소셜 진입점은 미설정 시 로그인으로 돌려보낸다", async () => {
    const r = await fetch(`${BASE}/api/auth/oauth?provider=google`, { redirect: "manual" });
    assert.equal(r.status, 307);
    assert.ok(String(r.headers.get("location")).includes("/login?error=unconfigured"));
    const bad = await fetch(`${BASE}/api/auth/oauth?provider=unknown`, { redirect: "manual" });
    assert.ok(String(bad.headers.get("location")).includes("/login?error=provider"));
  });
  it("카카오·네이버는 지원하지 않는다(Google만 제공)", async () => {
    for (const p of ["kakao", "naver"]) {
      const r = await fetch(`${BASE}/api/auth/oauth?provider=${p}`, { redirect: "manual" });
      assert.ok(String(r.headers.get("location")).includes("/login?error=provider"));
    }
  });
});

describe("VS-2A 매수 흐름", () => {
  it("매매 매물은 매매가를 별도로 저장한다", async () => {
    const r = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "매매집", address: "서울 관악구 매매로 1 (가상)", tradeType: "매매",
        deposit: 0, rent: 0, salePrice: 85000, fee: 5, area: 59, moveIn: "2026-12-01",
        options: [], description: "", publisher: "주인",
      }),
    }, OWNER);
    assert.equal(r.status, 201);
    assert.equal(r.body.tradeType, "매매");
    assert.equal(r.body.salePrice, 85000);
    assert.equal(r.body.ownerId, "u-owner2");
    vs2aListing = r.body.id;
  });
  it("매매가 없으면 400이다", async () => {
    const r = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "매매집", address: "서울 관악구 매매로 1 (가상)", tradeType: "매매",
        deposit: 0, rent: 0, fee: 5, area: 59, moveIn: "2026-12-01",
        options: [], description: "", publisher: "주인",
      }),
    }, OWNER);
    assert.equal(r.status, 400);
  });
  it("본인 매물 문의는 400이다", async () => {
    const r = await api(`/api/deals/${vs2aListing}/rooms`, { method: "POST", body: JSON.stringify({}) }, OWNER);
    assert.equal(r.status, 400);
  });
  it("타인 문의로 독립 거래방이 생긴다", async () => {
    const r = await api(`/api/deals/${vs2aListing}/rooms`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
    assert.equal(r.status, 201);
    vs2aRoom = r.body.id;
  });
  it("참여자 메시지를 공유하고 제삼자는 403이다", async () => {
    const s = await api(`/api/rooms/${vs2aRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "85000에 삽니다" }),
    }, HUMAN);
    assert.equal(s.status, 201);
    const o = await api(`/api/rooms/${vs2aRoom}/messages`, {}, OWNER);
    assert.ok(o.body.some((m) => m.text === "85000에 삽니다"));
    assert.equal((await api(`/api/rooms/${vs2aRoom}/messages`, {}, STRANGER)).status, 403);
    assert.equal((await api(`/api/rooms/${vs2aRoom}/messages`)).status, 401);
  });
  it("내 방 목록에 보인다", async () => {
    const mine = await api("/api/rooms", {}, HUMAN);
    assert.ok(mine.body.some((r) => r.id === vs2aRoom && r.demo === false));
    const other = await api("/api/rooms", {}, STRANGER);
    assert.ok(other.body.every((r) => r.id !== vs2aRoom));
  });
  it("방 메타는 멤버만 본다", async () => {
    const m = await api(`/api/rooms/${vs2aRoom}`, {}, HUMAN);
    assert.equal(m.status, 200);
    assert.equal(m.body.listing.title, "매매집");
    assert.equal(m.body.demo, false);
    assert.equal((await api(`/api/rooms/${vs2aRoom}`, {}, STRANGER)).status, 403);
  });
  it("공용 스레드는 폐쇄됐다", async () => {
    assert.equal((await api(`/api/deals/${vs2aListing}/messages`)).status, 410);
  });
});

describe("VS-2B AI 시연방", () => {
  it("시드 문의에 AI 첫인사가 붙는다", async () => {
    const r = await api(`/api/deals/s21/rooms`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
    assert.equal(r.status, 201);
    vs2bRoom = r.body.id;
    const list = await api(`/api/rooms/${vs2bRoom}/messages`, {}, HUMAN);
    const ai = list.body.filter((m) => m.author_type === "demo_agent");
    assert.equal(ai.length, 1);
    assert.ok(ai[0].author.includes("AI 매도자"));
    assert.ok(ai[0].text.includes("매매"));
  });
  it("사람 1건에 AI 1건만 답한다", async () => {
    const s = await api(`/api/rooms/${vs2bRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "매매가 얼마인가요?" }),
    }, HUMAN);
    assert.equal(s.status, 201);
    const inv = await api(`/api/rooms/${vs2bRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(inv.status, 201);
    assert.equal(inv.body.provider, "mock");
    const list = await api(`/api/rooms/${vs2bRoom}/messages`, {}, HUMAN);
    const humans = list.body.filter((m) => m.author_type === "human");
    const ais = list.body.filter((m) => m.author_type === "demo_agent");
    assert.equal(humans.length, 1);
    assert.equal(ais.length, 2);
    assert.ok(ais[1].text.includes("가격은"));
  });
  it("실거래방에는 AI가 끼지 않는다", async () => {
    const before = (await api(`/api/rooms/${vs2aRoom}/messages`, {}, HUMAN)).body.length;
    const s = await api(`/api/rooms/${vs2aRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "매매가 확인합니다" }),
    }, HUMAN);
    assert.equal(s.status, 201);
    const after = (await api(`/api/rooms/${vs2aRoom}/messages`, {}, HUMAN)).body;
    assert.equal(after.length, before + 1);
    assert.ok(after.every((m) => m.author_type === "human"));
  });
  it("시연방도 제삼자는 403이다", async () => {
    assert.equal((await api(`/api/rooms/${vs2bRoom}/messages`, {}, STRANGER)).status, 403);
  });
});

describe("VS-2C Agent Service", () => {
  it("invoke는 provider·model을 mock으로 구분한다", async () => {
    const s = await api(`/api/rooms/${vs2bRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "면적 어떻게 되나요?" }),
    }, HUMAN);
    assert.equal(s.status, 201);
    const inv = await api(`/api/rooms/${vs2bRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(inv.status, 201);
    assert.equal(inv.body.provider, "mock");
    assert.equal(inv.body.model, "mock-v1");
  });
  it("같은 트리거 재호출은 기존 결과를 돌려준다", async () => {
    const s = await api(`/api/rooms/${vs2bRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "옵션 뭐가 있나요?" }),
    }, HUMAN);
    const first = await api(`/api/rooms/${vs2bRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(first.status, 201);
    const before = (await api(`/api/rooms/${vs2bRoom}/messages`, {}, HUMAN)).body.length;
    const second = await api(`/api/rooms/${vs2bRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
    const after = (await api(`/api/rooms/${vs2bRoom}/messages`, {}, HUMAN)).body.length;
    assert.equal(after, before);
  });
  it("동시 호출에도 응답은 1건이다", async () => {
    const s = await api(`/api/rooms/${vs2bRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "수리 됐나요?" }),
    }, HUMAN);
    const aisBefore = (await api(`/api/rooms/${vs2bRoom}/messages`, {}, HUMAN)).body.filter(
      (m) => m.author_type === "demo_agent",
    ).length;
    const results = await Promise.all([0, 1, 2].map(() => api(`/api/rooms/${vs2bRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN)));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.every((r) => r.status === 200 || r.status === 201 || r.status === 409));
    const aisAfter = (await api(`/api/rooms/${vs2bRoom}/messages`, {}, HUMAN)).body.filter(
      (m) => m.author_type === "demo_agent",
    ).length;
    assert.equal(aisAfter, aisBefore + 1);
  });
  it("협상 맥락이 이어진다", async () => {
    const s = await api(`/api/rooms/${vs2bRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "44500에 합시다" }),
    }, HUMAN);
    const inv = await api(`/api/rooms/${vs2bRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(inv.status, 201);
    assert.ok(inv.body.text.includes("가능합니다"));
  });
  it("실거래방 invoke는 404다", async () => {
    const s = await api(`/api/rooms/${vs2aRoom}/messages`, {
      method: "POST", body: JSON.stringify({ text: "다시 확인합니다" }),
    }, HUMAN);
    assert.equal(s.status, 201);
    const inv = await api(`/api/rooms/${vs2aRoom}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(inv.status, 404);
  });
});

describe("VS-2D 페르소나·협상", () => {
  async function ask(listingId, text) {
    const room = await api(`/api/deals/${listingId}/rooms`, { method: "POST", body: JSON.stringify({}) }, HUMAN);
    assert.equal(room.status, 201);
    const s = await api(`/api/rooms/${room.body.id}/messages`, {
      method: "POST", body: JSON.stringify({ text }),
    }, HUMAN);
    assert.equal(s.status, 201);
    const inv = await api(`/api/rooms/${room.body.id}/agent/invoke`, {
      method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
    }, HUMAN);
    assert.equal(inv.status, 201);
    return inv.body.text;
  }
  it("매물마다 가격이 정확하다", async () => {
    assert.ok((await ask("s22", "면적 어떻게 되나요?")).includes("24㎡"));
    assert.ok((await ask("s24", "매매가 얼마인가요?")).includes("39,000만원"));
  });
  it("범위 밖 제안은 거절한다", async () => {
    assert.equal(await ask("s21", "43000에 합시다"), "그 금액은 어렵습니다.");
  });
  it("미정 매물은 임의 할인을 안 한다", async () => {
    assert.equal(await ask("s23", "70000에 합시다"), "그 금액은 어렵습니다.");
  });
  it("모르는 사항은 추측하지 않는다", async () => {
    assert.equal(await ask("s21", "주차장 있나요?"), "시나리오에 없어 확인이 필요합니다.");
  });
  it("같은 질문에는 같은 답을 한다", async () => {
    const a = await ask("s21", "매매가 얼마인가요?");
    const b = await ask("s21", "매매가 얼마인가요?");
    assert.equal(a, b);
    assert.ok(a.includes("45,000만원"));
  });
  it("범위 내 제안은 수용한다", async () => {
    assert.ok((await ask("s24", "38000에 합시다")).includes("가능합니다"));
  });
});
