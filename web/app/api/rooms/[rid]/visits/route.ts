import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";
import { getRoom, isRoomMember, type Room } from "@/lib/rooms";

async function guard(req: Request, rid: string): Promise<{ err: Response } | { room: Room }> {
  const g = guardRead(req);
  if (g) return { err: g };
  const room = await getRoom(rid);
  if (!room) return { err: notFound("거래방 없음") };
  const a = await authenticate(req);
  if ("error" in a) return { err: ok({ error: a.error }, a.status) };
  if (!(await isRoomMember(rid, a.identity.userId))) return { err: ok({ error: "조회 권한 없음" }, 403) };
  return { room };
}

export async function GET(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const r = await guard(req, params.rid);
  if ("err" in r) return r.err;
  const rows = await getDal().all(
    "SELECT * FROM visits WHERE room_id = ? ORDER BY visit_date ASC, visit_time ASC",
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
  const date = String(parsed.value.date ?? "");
  const time = String(parsed.value.time ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return bad("날짜·시간 형식 오류");
  const id = randomUUID();
  await getDal().run(
    "INSERT INTO visits (id,listing_id,visit_date,visit_time,status,room_id,created_at) VALUES (?,?,?,?,?,?,?)",
    [id, r.room.listing_id, date, time, "제안됨", params.rid, now()],
  );
  return ok({ id }, 201);
}
