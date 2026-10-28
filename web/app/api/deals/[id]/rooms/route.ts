import { guardRead, guardWrite, listingExists, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { createRoom, visibleRooms } from "@/lib/rooms";

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
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await listingExists(params.id))) return notFound("매물 없음");
  return ok(await createRoom(params.id, a.identity.userId), 201);
}
