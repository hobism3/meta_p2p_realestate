import { bad, guardRead, guardWrite, listingExists, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { listingOwnerId } from "@/lib/authz";
import { createRoom, visibleRooms } from "@/lib/rooms";
import { maybeDemoGreeting } from "@/lib/demo";

// 거래방 목록. 소유자는 전 방, 나머지는 멤버인 방만 본다.
export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  return ok(await visibleRooms(params.id, a.identity.userId));
}

// 거래방 생성. 생성자 + 매물 소유자가 멤버가 된다.
// 본인 매물 문의는 1인방이 되므로 400으로 막는다. 소유자 없는 시드 매물은 시연방이 된다.
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  const ownerId = await listingOwnerId(params.id);
  if (ownerId && ownerId === a.identity.userId) return bad("본인 매물에는 문의할 수 없습니다");
  const room = await createRoom(params.id, a.identity.userId);
  // 시연방이면 AI 상대방 첫인사를 붙인다. 시나리오 설정 없이 자동 연결된다.
  await maybeDemoGreeting(room.id, params.id);
  return ok(room, 201);
}
