// 인증 테스트. 자체 발급 토큰으로 검증 로직을 증명.
// 실행: web/에서 `node --test tests/auth.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mintTestToken, resolveActor, verifyJwt } from "../lib/auth.ts";

const SECRET = "test-secret-123";
const NOW = 1800000000;

function req(headers = {}) {
  return new Request("http://x/", { headers });
}

describe("JWT 검증", () => {
  it("정상 토큰을 통과시킨다", () => {
    const t = mintTestToken("u1", "집주인", "landlord", SECRET, NOW + 3600);
    const v = verifyJwt(t, SECRET, NOW);
    assert.deepEqual(v, { sub: "u1", name: "집주인", role: "landlord" });
  });
  it("만료 토큰을 거부한다", () => {
    const t = mintTestToken("u1", "집주인", "landlord", SECRET, NOW - 1);
    assert.equal(verifyJwt(t, SECRET, NOW), null);
  });
  it("서명 불일치를 거부한다", () => {
    const t = mintTestToken("u1", "집주인", "landlord", "other", NOW + 3600);
    assert.equal(verifyJwt(t, SECRET, NOW), null);
  });
  it("역할 외 값을 거부한다", () => {
    const t = mintTestToken("u1", "중개인", "중개인", SECRET, NOW + 3600);
    assert.equal(verifyJwt(t, SECRET, NOW), null);
  });
  it("깨진 토큰을 거부한다", () => {
    assert.equal(verifyJwt("깨짐", SECRET, NOW), null);
  });
});

describe("작성자 확정", () => {
  it("dev 모드에서는 body를 쓴다", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const r = resolveActor(req(), { author: "테스터", role: "tenant" });
    assert.equal(r.actor.name, "테스터");
  });
  it("supabase 모드에서는 토큰을 쓴다", () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const t = mintTestToken("u9", "임차인", "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);
    const r = resolveActor(req({ authorization: `Bearer ${t}` }), { author: "가짜", role: "landlord" });
    assert.equal(r.actor.userId, "u9");
    assert.equal(r.actor.role, "tenant");
    delete process.env.SUPABASE_JWT_SECRET;
  });
  it("supabase 모드에서 토큰 없으면 401이다", () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const r = resolveActor(req(), { author: "x", role: "tenant" });
    assert.equal(r.status, 401);
    delete process.env.SUPABASE_JWT_SECRET;
  });
});
