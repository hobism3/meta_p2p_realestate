import { VISIT_STATUS, bad, guardWrite, listingExists, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; vid: string } },
): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const status = String(parsed.value.status ?? "");
  if (!VISIT_STATUS.includes(status)) return bad("상태 오류");
  const cur = await getDal().get("SELECT * FROM visits WHERE id = ? AND listing_id = ?", [
    params.vid,
    params.id,
  ]);
  if (!cur) return notFound("일정 없음");
  await getDal().run("UPDATE visits SET status = ? WHERE id = ?", [status, params.vid]);
  return ok({ id: params.vid, status });
}
