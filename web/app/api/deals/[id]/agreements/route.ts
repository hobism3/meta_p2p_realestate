import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, listingExists, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const rows = await getDal().all(
    "SELECT * FROM agreements WHERE listing_id = ? AND room_id IS NULL ORDER BY created_at ASC",
    [params.id],
  );
  return ok(rows);
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const text = String(parsed.value.text ?? "").trim();
  if (!text) return bad("내용 필수");
  if (text.length > 2000) return bad("내용 길이 초과");
  const id = randomUUID();
  await getDal().run("INSERT INTO agreements (id,listing_id,text,created_at) VALUES (?,?,?,?)", [
    id,
    params.id,
    text,
    now(),
  ]);
  return ok({ id }, 201);
}
