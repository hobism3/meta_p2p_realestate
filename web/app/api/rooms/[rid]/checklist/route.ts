import { bad, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getRoom, isRoomMember, type Room } from "@/lib/rooms";

async function guard(req: Request, rid: string): Promise<{ err: Response } | { room: Room }> {
  const g = guardRead(req);
  if (g) return { err: g };
  const room = await getRoom(rid);
  if (!room) return { err: notFound("거래방 없음") };
  const a = authenticate(req);
  if ("error" in a) return { err: ok({ error: a.error }, a.status) };
  if (!(await isRoomMember(rid, a.identity.userId))) return { err: ok({ error: "조회 권한 없음" }, 403) };
  return { room };
}

export async function GET(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const r = await guard(req, params.rid);
  if ("err" in r) return r.err;
  const rows = await getDal().all("SELECT item, state FROM room_checklist WHERE room_id = ?", [
    params.rid,
  ]);
  const checks: Record<string, string> = {};
  for (const row of rows) checks[String(row.item)] = String(row.state);
  return ok(checks);
}

export async function PUT(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  const r = await guard(req, params.rid);
  if ("err" in r) return r.err;
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
        "INSERT INTO room_checklist (room_id,item,state) VALUES (?,?,?) ON CONFLICT(room_id,item) DO UPDATE SET state=excluded.state",
        [params.rid, item, state === "done" ? "done" : ""],
      );
    }
  });
  return ok({ ok: true });
}
