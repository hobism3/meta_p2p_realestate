// M1-A 인증 테스트. 역할은 권한이 아니다.
// 실행: web/에서 `node --test tests/auth.test.mjs`
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createSign, generateKeyPairSync } from "node:crypto";
import {
  authenticate,
  devAuthAllowed,
  mintTestToken,
  resolveAuthor,
  verifyJwt,
  verifySupabaseJwt,
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
  it("ES256 토큰을 JWKS로 검증한다(로컬 키쌍·로컬 JWKS 서버)", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    jwk.kid = "test-kid-1";
    const srv = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise((s) => srv.listen(0, "127.0.0.1", s));
    const port = srv.address().port;
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const h = enc({ alg: "ES256", kid: "test-kid-1", typ: "JWT" });
    const p = enc({ sub: "u-es", exp: Math.floor(Date.now() / 1000) + 3600, iss: "http://x/auth/v1", user_metadata: { full_name: "ES사용자" } });
    const sig = createSign("sha256").update(`${h}.${p}`).sign(privateKey).toString("base64url");
    const token = `${h}.${p}.${sig}`;
    process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      const v = await verifySupabaseJwt(token);
      assert.deepEqual(v, { sub: "u-es", name: "ES사용자" });
      const a = await authenticate(req({ authorization: `Bearer ${token}` }));
      assert.deepEqual(a.identity, { userId: "u-es", name: "ES사용자" });
      const bad = await authenticate(req({ authorization: "Bearer broken.token.here" }));
      assert.equal(bad.status, 401);
    } finally {
      delete process.env.SUPABASE_URL;
      srv.close();
    }
  });
  it("ES256 토큰은 secret 방식으로 거부한다", async () => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const fake = `${enc({ alg: "ES256", kid: "x", typ: "JWT" })}.${enc({ sub: "u1" })}.e30`;
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    assert.equal(await verifySupabaseJwt(fake), null);
  });
});

describe("dev 인증 허용", () => {
  it("ALLOW_DEV_AUTH=true에서 dev 허용", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    process.env.ALLOW_DEV_AUTH = "true";
    assert.equal(devAuthAllowed(), true);
    delete process.env.ALLOW_DEV_AUTH;
  });
  it("플래그 없으면 secret 없이 dev 불가", async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.ALLOW_DEV_AUTH;
    assert.equal(devAuthAllowed(), false);
    const r = await authenticate(req());
    assert.equal(r.status, 401);
  });
});

describe("작성자 확정", () => {
  it("dev 모드에서는 body를 쓴다", async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    process.env.ALLOW_DEV_AUTH = "true";
    const r = await resolveAuthor(req(), { author: "테스터" });
    assert.deepEqual(r.author, { userId: "dev:테스터", name: "테스터" });
    delete process.env.ALLOW_DEV_AUTH;
  });
  it("supabase 모드에서는 토큰 신원을 쓴다", async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const t = mintTestToken("u9", "임차인", "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);
    const r = await resolveAuthor(req({ authorization: `Bearer ${t}` }), { author: "가짜" });
    assert.deepEqual(r.author, { userId: "u9", name: "임차인" });
    delete process.env.SUPABASE_JWT_SECRET;
  });
  it("supabase 모드에서 토큰 없으면 401이다", async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const r = await resolveAuthor(req(), { author: "x" });
    assert.equal(r.status, 401);
    delete process.env.SUPABASE_JWT_SECRET;
  });
});
