import { guardRead, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getRoom, isRoomMember } from "@/lib/rooms";

/** VS-3A 거래 현황. 같은 방 멤버만 읽는다. source_msg_ids는 JSON 문자열로 둔다. */
export async function GET(req: Request, { params }: { params: { rid: string } }) {
  const g = guardRead(req);
  if (g) return g;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "조회 권한 없음" }, 403);
  const dal = getDal();
  const conditions = await dal.all(
    "SELECT name, value, proposer, status, source_msg_ids, version, updated_at, confirmed_by, confirmed_at, confirmed_version FROM room_conditions WHERE room_id = ? ORDER BY name",
    [params.rid],
  );
  const history = await dal.all(
    "SELECT name, old_value, new_value, source_msg_ids, created_at FROM condition_history WHERE room_id = ? ORDER BY created_at DESC LIMIT 20",
    [params.rid],
  );
  const ids: string[] = [];
  for (const c of conditions as { confirmed_by?: unknown }[]) {
    const v = String(c.confirmed_by ?? "");
    if (v && ids.indexOf(v) < 0) ids.push(v);
  }
  const names: Record<string, string> = {};
  for (const id of ids) {
    const m = await dal.get(
      "SELECT author FROM messages WHERE room_id = ? AND user_id = ? AND author_type = 'human' ORDER BY created_at DESC LIMIT 1",
      [params.rid, id],
    );
    names[id] = m ? String(m.author ?? id) : id;
  }
  const withNames = (conditions as Record<string, unknown>[]).map((c) => ({
    ...c,
    confirmed_name: names[String(c.confirmed_by ?? "")] ?? "",
  }));
  return ok({ conditions: withNames, history });
}
