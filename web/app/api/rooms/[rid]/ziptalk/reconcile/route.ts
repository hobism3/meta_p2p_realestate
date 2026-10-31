import { guardWrite, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { runZiptalk } from "@/lib/ziptalk-service";

/** Explicit, idempotent historical recheck. No Meta/paid LLM calls. */
export async function POST(req: Request, { params }: { params: { rid: string } }) {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "조회 권한 없음" }, 403);
  const r = await runZiptalk({ roomId: params.rid, reconcile: true });
  if (!r.ok) return ok({ error: r.error, provider: r.provider, model: r.model }, r.status);
  return ok({
    bubble_message_id: r.bubbleMessageId,
    applied: r.applied,
    created: r.created,
    provider: r.provider,
    model: r.model,
    fallback: r.fallback ?? null,
  }, r.created ? 201 : 200);
}
