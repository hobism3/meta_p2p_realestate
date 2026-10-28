import { NextResponse } from "next/server";

const PROVIDERS = ["google"] as const;

// Google은 Supabase 내장 제공자다. 소셜 로그인은 Google만 제공한다.

function providerId(p: string): string {
  return p;
}

// 소셜 로그인 진입점. Supabase authorize로 리다이렉트한다.
// 제공자 설정(Supabase 대시보드 + redirect_to)이 없으면 로그인 페이지로 돌려보낸다.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "";
  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.redirect(new URL("/login?error=provider", url.origin));
  }
  const base = process.env.SUPABASE_URL;
  if (!base) {
    return NextResponse.redirect(new URL("/login?error=unconfigured", url.origin));
  }
  const redirectTo = new URL("/auth/callback", url.origin).toString();
  const auth = new URL(`${base}/auth/v1/authorize`);
  auth.searchParams.set("provider", providerId(provider));
  auth.searchParams.set("redirect_to", redirectTo);
  return NextResponse.redirect(auth);
}
