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
    "SELECT name, value, proposer, status, source_msg_ids, version, updated_at FROM room_conditions WHERE room_id = ? ORDER BY name",
    [params.rid],
  );
  const history = await dal.all(
    "SELECT name, old_value, new_value, source_msg_ids, created_at FROM condition_history WHERE room_id = ? ORDER BY created_at DESC LIMIT 20",
    [params.rid],
  );
  return ok({ conditions, history });
}
