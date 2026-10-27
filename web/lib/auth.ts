import { createHmac, timingSafeEqual } from "node:crypto";
import { ROLES } from "./listings.ts";

export interface Actor {
  userId: string;
  name: string;
  role: string;
}

function b64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/** Supabase 형식 JWT(HS256) 검증. 테스트 가능한 순수 함수. */
export function verifyJwt(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { sub: string; name: string; role: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: { alg?: string };
  let payload: { sub?: string; exp?: number; user_metadata?: { name?: string; role?: string } };
  try {
    header = JSON.parse(b64url(h)) as { alg?: string };
    payload = JSON.parse(b64url(p)) as {
      sub?: string;
      exp?: number;
      user_metadata?: { name?: string; role?: string };
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
  const role = payload.user_metadata?.role ?? "";
  if (!ROLES.includes(role)) return null;
  return { sub: payload.sub, name: payload.user_metadata?.name ?? payload.sub, role };
}

/** 테스트용 토큰 생성. 운영에서는 Supabase가 발급. */
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

/**
 * 작성자 확정. Supabase 모드에서는 토큰 신원과 일치해야 한다.
 * dev 모드에서는 기존처럼 body 값을 쓴다.
 */
export function resolveActor(
  req: Request,
  body: { author?: unknown; role?: unknown },
): { actor: Actor } | { status: number; error: string } {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    const name = String(body.author ?? "").trim();
    const role = String(body.role ?? "");
    if (!name) return { status: 400, error: "작성자·내용 필수" };
    if (!ROLES.includes(role)) return { status: 400, error: "역할 오류" };
    return { actor: { userId: `dev:${name}`, name, role } };
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const v = verifyJwt(token, secret);
  if (!v) return { status: 401, error: "인증 필요" };
  return { actor: { userId: v.sub, name: v.name, role: v.role } };
}
