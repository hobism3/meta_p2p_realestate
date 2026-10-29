import { guardWrite, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getRoom, isRoomMember } from "@/lib/rooms";

/**
 * VS-4C.3 구형 단독 확인 경로 제거. 일방 확인은 양측 합의를 우회하므로 410으로 닫는다.
 * 합의는 거래 현황의 합의 카드(POST /proposals/[pid]/decide)로만 한다.
 * 일정 수락(방문)은 visits 경로의 원자 수락을 쓴다.
 */
export async function POST(req: Request, { params }: { params: { rid: string } }) {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "확인 권한 없음" }, 403);
  return ok({ error: "구형 확인 경로는 제거됐습니다. 합의 카드에서 동의해 주세요." }, 410);
}
