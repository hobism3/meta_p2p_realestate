import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, listingExists, notFound, ok, readJson } from "@/lib/api";
import { resolveActor } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const rows = await getDal().all(
    "SELECT * FROM messages WHERE listing_id = ? ORDER BY created_at ASC",
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
  const resolved = resolveActor(req, b);
  if ("error" in resolved) return ok({ error: resolved.error }, resolved.status);
  const { name: author, role } = resolved.actor;
  const id = randomUUID();
  await getDal().run(
    "INSERT INTO messages (id,listing_id,author,role,text,created_at) VALUES (?,?,?,?,?,?)",
    [id, params.id, author, role, text, now()],
  );
  return ok({ id }, 201);
}
