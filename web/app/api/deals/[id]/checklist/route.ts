import { bad, guardRead, guardWrite, listingExists, notFound, ok, readJson } from "@/lib/api";
import { getDal } from "@/lib/dal";

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const rows = await getDal().all("SELECT item, state FROM checklist WHERE listing_id = ?", [
    params.id,
  ]);
  const checks: Record<string, string> = {};
  for (const r of rows) checks[String(r.item)] = String(r.state);
  return ok(checks);
}

export async function PUT(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const checks = parsed.value.checks;
  if (checks === null || typeof checks !== "object" || Array.isArray(checks)) return bad("형식 오류");
  const entries = Object.entries(checks as Record<string, unknown>);
  if (entries.length > 50) return bad("항목 수 초과");
  for (const [item] of entries) {
    if (item.length > 100) return bad("항목명 길이 초과");
  }
  const dal = getDal();
  await dal.withTransaction(async (tx) => {
    for (const [item, state] of entries) {
      await tx.run(
        "INSERT INTO checklist (listing_id,item,state) VALUES (?,?,?) ON CONFLICT(listing_id,item) DO UPDATE SET state=excluded.state",
        [params.id, item, state === "done" ? "done" : ""],
      );
    }
  });
  return ok({ ok: true });
}
