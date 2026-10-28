// M1-A 인증 테스트. 역할은 권한이 아니다.
// 실행: web/에서 `node --test tests/auth.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  devAuthAllowed,
  mintTestToken,
  resolveAuthor,
  verifyJwt,
} from "../lib/auth.ts";

const SECRET = "test-secret-123";
const NOW = 1800000000;

function req(headers = {}) {
  return new Request("http://x/", { headers });
}

describe("JWT 검증", () => {
  it("정상 토큰에서 신원을 돌린다", () => {
    const t = mintTestToken("u1", "집주인", "landlord", SECRET, NOW + 3600);
    assert.deepEqual(verifyJwt(t, SECRET, NOW), { sub: "u1", name: "집주인" });
  });
  it("user_metadata.role이 달라도 신원은 통과한다(권한 아님)", () => {
    const t = mintTestToken("u1", "집주인", "admin", SECRET, NOW + 3600);
    const v = verifyJwt(t, SECRET, NOW);
    assert.ok(v && !("role" in v));
    assert.equal(v.sub, "u1");
  });
  it("만료 토큰을 거부한다", () => {
    const t = mintTestToken("u1", "집주인", "landlord", SECRET, NOW - 1);
    assert.equal(verifyJwt(t, SECRET, NOW), null);
  });
  it("서명 불일치를 거부한다", () => {
    const t = mintTestToken("u1", "집주인", "landlord", "other", SECRET, NOW + 3600);
    assert.equal(verifyJwt(t, SECRET, NOW), null);
  });
  it("깨진 토큰을 거부한다", () => {
    assert.equal(verifyJwt("깨짐", SECRET, NOW), null);
  });
});

describe("dev 인증 허용", () => {
  it("secret 없으면 로컬에서 dev 허용", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.NODE_ENV;
    assert.equal(devAuthAllowed(), true);
  });
  it("운영에서는 secret 없이 dev 불가", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    process.env.NODE_ENV = "production";
    assert.equal(devAuthAllowed(), false);
    const r = authenticate(req());
    assert.equal(r.status, 401);
    delete process.env.NODE_ENV;
  });
});

describe("작성자 확정", () => {
  it("dev 모드에서는 body를 쓴다", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.NODE_ENV;
    const r = resolveAuthor(req(), { author: "테스터" });
    assert.deepEqual(r.author, { userId: "dev:테스터", name: "테스터" });
  });
  it("supabase 모드에서는 토큰 신원을 쓴다", () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const t = mintTestToken("u9", "임차인", "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);
    const r = resolveAuthor(req({ authorization: `Bearer ${t}` }), { author: "가짜" });
    assert.deepEqual(r.author, { userId: "u9", name: "임차인" });
    delete process.env.SUPABASE_JWT_SECRET;
  });
  it("supabase 모드에서 토큰 없으면 401이다", () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const r = resolveAuthor(req(), { author: "x" });
    assert.equal(r.status, 401);
    delete process.env.SUPABASE_JWT_SECRET;
  });
});
