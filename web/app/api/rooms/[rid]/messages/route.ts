import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";
import { getRoom, isRoomMember, type Room } from "@/lib/rooms";
import type { Identity } from "@/lib/auth";
import { maybeDemoReply } from "@/lib/demo";

async function guard(
  req: Request,
  rid: string,
): Promise<{ err: Response } | { room: Room; identity: Identity }> {
  const g = guardRead(req);
  if (g) return { err: g };
  const room = await getRoom(rid);
  if (!room) return { err: notFound("거래방 없음") };
  const a = await authenticate(req);
  if ("error" in a) return { err: ok({ error: a.error }, a.status) };
  if (!(await isRoomMember(rid, a.identity.userId))) return { err: ok({ error: "조회 권한 없음" }, 403) };
  return { room, identity: a.identity };
}

export async function GET(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const r = await guard(req, params.rid);
  if ("err" in r) return r.err;
  const rows = await getDal().all(
    "SELECT * FROM messages WHERE room_id = ? ORDER BY created_at ASC",
    [params.rid],
  );
  return ok(rows);
}

export async function POST(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  const r = await guard(req, params.rid);
  if ("err" in r) return r.err;
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  if (parsed.value.author_type !== undefined && parsed.value.author_type !== "human") {
    return bad("작성자 유형 오류");
  }
  const text = String(parsed.value.text ?? "").trim();
  if (!text) return bad("내용 필수");
  if (text.length > 2000) return bad("내용 길이 초과");
  const id = randomUUID();
  await getDal().run(
    "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, r.room.listing_id, r.identity.name, "", r.identity.userId, "human", params.rid, text, now()],
  );
  try {
    // 시연방이면 AI 상대방이 최대 1건 답한다. 실패해도 사람 메시지 전송은 유지된다.
    await maybeDemoReply(params.rid, r.room.listing_id, text);
  } catch {
    // 시연 응답 실패를 조용히 넘긴다. 모델 실패를 성공처럼 표시하지 않는다.
  }
  return ok({ id }, 201);
}
