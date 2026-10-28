import { NextResponse } from "next/server";
import { SEED_LISTINGS } from "@/lib/listings";
import { getDal } from "@/lib/dal";
import { rowToListing } from "@/lib/db";
import { checkRate } from "@/lib/ratelimit";

const BODY_LIMIT = 256 * 1024;

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "인증 필요" }, { status: 401 });
}

function tooLarge(): NextResponse {
  return NextResponse.json({ error: "요청 크기 초과" }, { status: 413 });
}

function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "요청 과다" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ?? "local").split(",")[0].trim();
}

export function guardWrite(req: Request): NextResponse | null {
  if (process.env.READ_ONLY === "true") {
    return NextResponse.json({ error: "읽기 전용 모드" }, { status: 403 });
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > BODY_LIMIT) return tooLarge();
  const token = process.env.WRITE_TOKEN;
  if (token && req.headers.get("x-write-token") !== token) return unauthorized();
  const r = checkRate(`w:${clientKey(req)}`);
  if (!r.ok) return tooMany(r.retryAfter);
  return null;
}

export function guardRead(req: Request): NextResponse | null {
  const r = checkRate(`r:${clientKey(req)}`);
  if (!r.ok) return tooMany(r.retryAfter);
  return null;
}

export async function readJson(req: Request): Promise<{ value: Record<string, unknown> } | { err: NextResponse }> {
  try {
    const v = (await req.json()) as Record<string, unknown>;
    if (v === null || typeof v !== "object" || Array.isArray(v)) return { err: bad("JSON 형식 오류") };
    return { value: v };
  } catch {
    return { err: bad("JSON 형식 오류") };
  }
}

export async function listingExists(id: string): Promise<boolean> {
  if (SEED_LISTINGS.some((l) => l.id === id)) return true;
  const r = await getDal().get("SELECT id FROM custom_listings WHERE id = ?", [id]);
  return r !== undefined;
}

export async function customListing(id: string): Promise<Record<string, unknown> | null> {
  const r = await getDal().get("SELECT * FROM custom_listings WHERE id = ?", [id]);
  return r ? rowToListing(r) : null;
}

export function seedListing(id: string): Record<string, unknown> | null {
  const l = SEED_LISTINGS.find((x) => x.id === id);
  return l ? { ...l, editable: false } : null;
}

export { ROLES, VISIT_STATUS } from "@/lib/listings";
