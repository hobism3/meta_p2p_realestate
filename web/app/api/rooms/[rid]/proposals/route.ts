import { guardRead, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { getProposals } from "@/lib/agreement-service";

/** VS-4C 합의 제안 목록. 방 멤버만 조회한다. */
export async function GET(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "조회 권한 없음" }, 403);
  const data = await getProposals(params.rid);
  return ok({ ...data, me: a.identity.userId });
}
