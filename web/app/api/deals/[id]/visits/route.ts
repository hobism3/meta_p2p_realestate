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
    "SELECT * FROM visits WHERE listing_id = ? AND room_id IS NULL ORDER BY visit_date ASC, visit_time ASC",
    [params.id],
  );
  return ok(rows);
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const a = authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const b = parsed.value;
  const date = String(b.date ?? "");
  const time = String(b.time ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return bad("날짜·시간 형식 오류");
  const id = randomUUID();
  await getDal().run(
    "INSERT INTO visits (id,listing_id,visit_date,visit_time,status,created_at) VALUES (?,?,?,?,?,?)",
    [id, params.id, date, time, "제안됨", now()],
  );
  return ok({ id }, 201);
}
