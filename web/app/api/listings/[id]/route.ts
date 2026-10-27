import { bad, customListing, guardRead, guardWrite, notFound, ok, readJson, seedListing } from "@/lib/api";
import { getDal } from "@/lib/dal";

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  const one = (await customListing(params.id)) ?? seedListing(params.id);
  if (!one) return notFound("매물 없음");
  return ok(one);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const cur = (await customListing(params.id)) as Record<string, unknown> | null;
  if (!cur) return notFound("시연용 기본 매물은 수정할 수 없습니다");
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const b = parsed.value;
  const patch: Record<string, string | number> = {};
  if (b.title !== undefined) {
    const v = String(b.title).trim();
    if (!v) return bad("제목 누락");
    patch.title = v;
  }
  if (b.description !== undefined) patch.description = String(b.description);
  if (b.address !== undefined) {
    const v = String(b.address).trim();
    if (!v) return bad("주소 누락");
    patch.address = v;
  }
  if (b.publisher !== undefined) {
    const v = String(b.publisher).trim();
    if (!v) return bad("게시자 누락");
    patch.publisher = v;
  }
  if (b.options !== undefined) {
    if (!Array.isArray(b.options)) return bad("옵션 형식 오류");
    patch.options_json = JSON.stringify(b.options.map(String));
  }
  if (b.moveIn !== undefined) {
    const v = String(b.moveIn).trim();
    if (!v) return bad("입주일 누락");
    patch.move_in = v;
  }
  for (const k of ["deposit", "rent", "fee", "area"] as const) {
    if (b[k] !== undefined) {
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < 0) return bad("금액·면적 오류");
      patch[k] = n;
    }
  }
  const tradeType = cur.tradeType as string;
  const rent = (patch.rent ?? cur.rent) as number;
  const area = (patch.area ?? cur.area) as number;
  if (area <= 0) return bad("면적 오류");
  if (tradeType === "월세" && rent <= 0) return bad("월세 필수");
  const keys = Object.keys(patch);
  if (keys.length === 0) return bad("변경 없음");
  await getDal().run(
    `UPDATE custom_listings SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    [...keys.map((k) => patch[k]), params.id],
  );
  return ok(await customListing(params.id));
}
