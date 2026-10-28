import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { ROLES } from "./listings.ts";

export interface Identity {
  userId: string;
  name: string;
}

function b64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function displayName(payload: {
  user_metadata?: { name?: string; full_name?: string };
  email?: string;
  sub?: string;
}): string {
  const meta = payload.user_metadata ?? {};
  if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  if (typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (typeof payload.email === "string" && payload.email) return payload.email;
  return payload.sub ?? "unknown";
}

/**
 * HS256 검증(레거시 프로젝트용). 신원(sub)만 확인한다.
 * user_metadata.role은 권한 근거로 절대 사용하지 않는다.
 */
export function verifyJwt(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { sub: string; name: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: { alg?: string };
  let payload: { sub?: string; exp?: number; email?: string; user_metadata?: { name?: string } };
  try {
    header = JSON.parse(b64url(h)) as { alg?: string };
    payload = JSON.parse(b64url(p)) as {
      sub?: string;
      exp?: number;
      email?: string;
      user_metadata?: { name?: string };
    };
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;
  const sig = Buffer.from(s, "base64url");
  const exp = sign(`${h}.${p}`, secret);
  if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) return null;
  if (typeof payload.exp === "number" && payload.exp <= nowSec) return null;
  if (!payload.sub) return null;
  return { sub: payload.sub, name: displayName(payload) };
}

interface JwksCache {
  at: number;
  keys: { kid?: string; kty?: string; crv?: string }[];
}

const jwksCache = new Map<string, JwksCache>();

async function getJwks(base: string): Promise<JwksCache["keys"]> {
  const cached = jwksCache.get(base);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.keys;
  const r = await fetch(`${base}/auth/v1/.well-known/jwks.json`);
  if (!r.ok) throw new Error("jwks fetch failed");
  const data = (await r.json()) as { keys?: JwksCache["keys"] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache.set(base, { at: Date.now(), keys });
  return keys;
}

/**
 * ES256 검증(신규 Supabase 프로젝트용). JWKS kid로 공개키를 골라 검증한다.
 */
export async function verifyEs256(
  token: string,
  supabaseUrl: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ sub: string; name: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: { alg?: string; kid?: string };
  let payload: { sub?: string; exp?: number; iss?: string; email?: string; user_metadata?: { name?: string; full_name?: string } };
  try {
    header = JSON.parse(b64url(h)) as { alg?: string; kid?: string };
    payload = JSON.parse(b64url(p)) as {
      sub?: string;
      exp?: number;
      iss?: string;
      email?: string;
      user_metadata?: { name?: string; full_name?: string };
    };
  } catch {
    return null;
  }
  if (header.alg !== "ES256" || !header.kid) return null;
  let keys: JwksCache["keys"];
  try {
    keys = await getJwks(supabaseUrl);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid && k.kty === "EC");
  if (!jwk) return null;
  let okSig = false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    okSig = verify("sha256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  } catch {
    return null;
  }
  if (!okSig) return null;
  if (typeof payload.exp === "number" && payload.exp <= nowSec) return null;
  if (!payload.sub) return null;
  if (payload.iss && !payload.iss.includes("/auth/v1")) return null;
  return { sub: payload.sub, name: displayName(payload) };
}

/** 테스트용 토큰 생성. role은 페이로드에 남기되 서버는 권한으로 쓰지 않는다. */
export function mintTestToken(
  sub: string,
  name: string,
  role: string,
  secret: string,
  exp: number,
): string {
  const enc = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "HS256", typ: "JWT" });
  const p = enc({ sub, exp, user_metadata: { name, role } });
  const s = sign(`${h}.${p}`, secret).toString("base64url");
  return `${h}.${p}.${s}`;
}

export function supabaseConfigured(): boolean {
  return !!process.env.SUPABASE_JWT_SECRET || !!process.env.SUPABASE_URL;
}

/**
 * dev 별명 인증은 명시적 로컬 전용(ALLOW_DEV_AUTH=true).
 * next start는 NODE_ENV를 production으로 강제하므로 NODE_ENV로 dev를 판별할 수 없다.
 * 운영(플래그 없음)에서는 secret 없이 쓰기가 전부 401로 닫힌다.
 */
export function devAuthAllowed(): boolean {
  return !process.env.SUPABASE_JWT_SECRET && !process.env.SUPABASE_URL && process.env.ALLOW_DEV_AUTH === "true";
}

/** 토큰 방식에 맞는 검증을 고른다. HS256 secret 우선, ES256(JWKS)은 SUPABASE_URL 필요. */
export async function verifySupabaseJwt(token: string): Promise<{ sub: string; name: string } | null> {
  const alg = (() => {
    try {
      return (JSON.parse(b64url(token.split(".")[0])) as { alg?: string }).alg;
    } catch {
      return undefined;
    }
  })();
  if (alg === "HS256" && process.env.SUPABASE_JWT_SECRET) {
    return verifyJwt(token, process.env.SUPABASE_JWT_SECRET);
  }
  if (alg === "ES256" && process.env.SUPABASE_URL) {
    return verifyEs256(token, process.env.SUPABASE_URL);
  }
  return null;
}

/**
 * 신원 확인. 모든 쓰기 API의 입구.
 * - dev 허용: 로컬 확인용 익명 신원. 권한 강제는 하지 않는다.
 * - 그 외: Bearer 검증 실패 시 401.
 */
export async function authenticate(req: Request): Promise<{ identity: Identity } | { status: number; error: string }> {
  if (!process.env.SUPABASE_JWT_SECRET && !process.env.SUPABASE_URL) {
    if (!devAuthAllowed()) return { status: 401, error: "인증 필요" };
    return { identity: { userId: "dev:anonymous", name: "anonymous" } };
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const v = await verifySupabaseJwt(token);
  if (!v) return { status: 401, error: "인증 필요" };
  return { identity: { userId: v.sub, name: v.name } };
}

/**
 * 메시지 작성자 확정.
 * - dev: 기존처럼 body 값을 쓴다(역할 형식은 유지).
 * - supabase 모드: 토큰 신원을 쓴다. 역할은 호출자가 DB에서 정한다.
 */
export async function resolveAuthor(
  req: Request,
  body: { author?: unknown },
): Promise<{ author: Identity } | { status: number; error: string }> {
  if (!process.env.SUPABASE_JWT_SECRET && !process.env.SUPABASE_URL) {
    if (!devAuthAllowed()) return { status: 401, error: "인증 필요" };
    const name = String(body.author ?? "").trim();
    if (!name) return { status: 400, error: "작성자·내용 필수" };
    return { author: { userId: `dev:${name}`, name } };
  }
  const a = await authenticate(req);
  if ("error" in a) return a;
  return { author: a.identity };
}

export { ROLES };
