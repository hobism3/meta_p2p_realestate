import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";
import { getRoom, isRoomMember, type Room } from "@/lib/rooms";
import type { Identity } from "@/lib/auth";
import {tryRealJiptok} from "@/lib/real-jiptok-service";
import {enqueueOwnerAiForMessage,drainOwnerAiJobs} from "@/lib/owner-ai-job-service";

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
  const id = randomUUID(),stamp=now();
  // Message and owner-AI outbox commit together. Even if the browser closes
  // before the response, the cron can later recover the accepted job.
  const queued=await getDal().withTransaction(async tx=>{
    await tx.run(
      "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id,r.room.listing_id,r.identity.name,"",r.identity.userId,"human",params.rid,text,stamp],
    );
    return enqueueOwnerAiForMessage(tx,{
      roomId:params.rid,listingId:r.room.listing_id,
      messageId:id,senderId:r.identity.userId,stamp,
    });
  });
  // Real-room Jiptok is emitted server-side, not by a browser follow-up.
  // No model call or consent is performed; duplicates are guarded in DB.
  await tryRealJiptok(params.rid,{kind:"message",sourceId:id,actorId:r.identity.userId});
  // Best effort first attempt from the server (never a browser follow-up).
  // Failures are persisted for cron retry and NEVER lose the human message.
  if(queued){
    try{await drainOwnerAiJobs({roomId:params.rid,triggerId:id,limit:1});}
    catch(e){console.warn("[owner-ai] immediate drain failed",e instanceof Error?e.name:"UnknownError");}
  }
  return ok({id,ownerAgentQueued:queued},201);
}
