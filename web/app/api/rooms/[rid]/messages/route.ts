import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";
import { getRoom, isRoomMember, type Room } from "@/lib/rooms";
import type { Identity } from "@/lib/auth";

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
  // 사람 메시지를 먼저 저장하고 끝낸다. AI 생성은 POST agent/invoke가 별도 단계로 처리한다.
  return ok({ id }, 201);
}
