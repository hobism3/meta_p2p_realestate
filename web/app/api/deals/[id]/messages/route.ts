import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, listingExists, notFound, ok, readJson } from "@/lib/api";
import { authenticate, ROLES, resolveAuthor, supabaseConfigured } from "@/lib/auth";
import { participantRole, recordParticipant } from "@/lib/authz";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  const rows = await getDal().all(
    "SELECT * FROM messages WHERE listing_id = ? AND room_id IS NULL ORDER BY created_at ASC",
    [params.id],
  );
  return ok(rows);
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const b = parsed.value;
  const text = String(b.text ?? "").trim();
  if (!text) return bad("작성자·내용 필수");
  if (text.length > 2000) return bad("내용 길이 초과");
  // 작성자 유형은 서버가 확정한다. 클라이언트 위장은 400으로 거부한다.
  if (b.author_type !== undefined && b.author_type !== "human") return bad("작성자 유형 오류");
  const resolved = await resolveAuthor(req, b);
  if ("error" in resolved) return ok({ error: resolved.error }, resolved.status);
  const { userId, name: author } = resolved.author;
  // 역할은 서버 DB에서 정한다. 토큰의 user_metadata.role은 쓰지 않는다.
  // dev에서는 기존처럼 body 역할을 검증한다.
  let role: string;
  if (supabaseConfigured()) {
    role = await participantRole(params.id, userId);
  } else {
    role = String(b.role ?? "");
    if (!ROLES.includes(role)) return bad("역할 오류");
  }
  const id = randomUUID();
  await getDal().run(
    "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,text,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [id, params.id, author, role, userId, "human", text, now()],
  );
  await recordParticipant(params.id, userId, role as "landlord" | "tenant");
  return ok({ id }, 201);
}
