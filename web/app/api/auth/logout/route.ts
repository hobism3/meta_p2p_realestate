import { ok } from "@/lib/api";

// Supabase Auth 로그아웃 프록시. Bearer 토큰을 그대로 전달한다.
export async function POST(req: Request): Promise<Response> {
  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon) return ok({ error: "인증 미설정" }, 503);
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return ok({ error: "인증 필요" }, 401);
  try {
    await fetch(`${base}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: anon, Authorization: auth },
    });
  } catch {
    return ok({ error: "인증 서버 오류" }, 502);
  }
  return ok({ ok: true });
}
