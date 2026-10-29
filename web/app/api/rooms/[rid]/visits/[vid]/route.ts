import { VISIT_STATUS, bad, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getRoom, isRoomMember } from "@/lib/rooms";

export async function PATCH(
  req: Request,
  { params }: { params: { rid: string; vid: string } },
): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "수정 권한 없음" }, 403);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const status = String(parsed.value.status ?? "");
  if (!VISIT_STATUS.includes(status)) return bad("상태 오류");
  const cur = await getDal().get("SELECT * FROM visits WHERE id = ? AND room_id = ?", [
    params.vid,
    params.rid,
  ]);
  if (!cur) return notFound("일정 없음");
  await getDal().run("UPDATE visits SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", [status, a.identity.userId, new Date().toISOString(), params.vid]);
  return ok({ id: params.vid, status });
}
