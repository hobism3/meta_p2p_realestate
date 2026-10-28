import { bad, ok, readJson } from "@/lib/api";

// Supabase Auth 로그인 프록시. 키는 서버 환경에만 둔다.
// SUPABASE_URL·SUPABASE_ANON_KEY 없으면 503(미설정).
export async function POST(req: Request): Promise<Response> {
  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon) return ok({ error: "인증 미설정" }, 503);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const email = String(parsed.value.email ?? "").trim();
  const password = String(parsed.value.password ?? "");
  if (!email || !password) return bad("이메일·비밀번호 필수");
  let r: Response;
  try {
    r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return ok({ error: "인증 서버 오류" }, 502);
  }
  const data = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    user?: { id?: string; email?: string };
  };
  if (!r.ok || !data.access_token) return ok({ error: "로그인 실패" }, 401);
  return ok({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3600,
    user: { id: data.user?.id ?? "", email: data.user?.email ?? "" },
  });
}
