import { guardRead, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { myRooms } from "@/lib/rooms";

// 내 거래방 목록. 멤버인 방만 본다.
export async function GET(req: Request): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  return ok(await myRooms(a.identity.userId));
}
