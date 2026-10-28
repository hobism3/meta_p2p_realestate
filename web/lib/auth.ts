import { createHmac, timingSafeEqual } from "node:crypto";
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

/**
 * Supabase Auth JWT(HS256) 검증. 신원(sub)만 확인한다.
 * user_metadata.role은 권한 근거로 절대 사용하지 않는다. 역할은 서버 DB가 정한다.
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
  const metaName = payload.user_metadata?.name;
  const name =
    typeof metaName === "string" && metaName.trim()
      ? metaName.trim()
      : typeof payload.email === "string" && payload.email
        ? payload.email
        : payload.sub;
  return { sub: payload.sub, name };
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
  return !!process.env.SUPABASE_JWT_SECRET;
}

/**
 * dev 별명 인증은 명시적 로컬 전용(ALLOW_DEV_AUTH=true).
 * next start는 NODE_ENV를 production으로 강제하므로 NODE_ENV로 dev를 판별할 수 없다.
 * 운영(플래그 없음)에서는 secret 없이 쓰기가 전부 401로 닫힌다.
 */
export function devAuthAllowed(): boolean {
  return !supabaseConfigured() && process.env.ALLOW_DEV_AUTH === "true";
}

/**
 * 신원 확인. 모든 쓰기 API의 입구.
 * - dev 허용: 로컬 확인용 익명 신원. 권한 강제는 하지 않는다.
 * - 운영 무secret: 401로 닫는다.
 * - supabase 모드: Bearer 검증 실패 시 401.
 */
export function authenticate(req: Request): { identity: Identity } | { status: number; error: string } {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    if (!devAuthAllowed()) return { status: 401, error: "인증 필요" };
    return { identity: { userId: "dev:anonymous", name: "anonymous" } };
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const v = verifyJwt(token, secret);
  if (!v) return { status: 401, error: "인증 필요" };
  return { identity: { userId: v.sub, name: v.name } };
}

/**
 * 메시지 작성자 확정.
 * - dev: 기존처럼 body 값을 쓴다(역할 형식은 유지).
 * - supabase 모드: 토큰 신원을 쓴다. 역할은 호출자가 DB에서 정한다.
 */
export function resolveAuthor(
  req: Request,
  body: { author?: unknown },
): { author: Identity } | { status: number; error: string } {
  if (!supabaseConfigured()) {
    if (!devAuthAllowed()) return { status: 401, error: "인증 필요" };
    const name = String(body.author ?? "").trim();
    if (!name) return { status: 400, error: "작성자·내용 필수" };
    return { author: { userId: `dev:${name}`, name } };
  }
  const a = authenticate(req);
  if ("error" in a) return a;
  return { author: a.identity };
}

export { ROLES };
