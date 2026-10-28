import { ok } from "@/lib/api";
import { authenticate, supabaseConfigured } from "@/lib/auth";

// 서버 측 JWT 검증 확인용. 토큰 신원을 그대로 돌려준다.
export async function GET(req: Request): Promise<Response> {
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  return ok({
    userId: a.identity.userId,
    name: a.identity.name,
    mode: supabaseConfigured() ? "supabase" : "dev",
  });
}
