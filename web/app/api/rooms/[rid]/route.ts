import { guardRead, notFound, ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { rowToListing } from "@/lib/db";
import { SEED_LISTINGS } from "@/lib/listings";
import { getRoom, isRoomMember } from "@/lib/rooms";

// 거래방 정보. 멤버만 본다. 소유자 없는 매물 방은 시연으로 구분한다.
export async function GET(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "조회 권한 없음" }, 403);
  const seed = SEED_LISTINGS.find((l) => l.id === room.listing_id);
  if (seed) {
    return ok({
      room,
      listing: { id: seed.id, title: seed.title, tradeType: seed.tradeType, salePrice: seed.salePrice, deposit: seed.deposit, rent: seed.rent },
      demo: true,
    });
  }
  const row = await getDal().get("SELECT * FROM custom_listings WHERE id = ?", [room.listing_id]);
  if (!row) return ok({ room, listing: null, demo: true });
  const custom = rowToListing(row) as { title: string; tradeType: string; salePrice: number; deposit: number; rent: number; ownerId: string };
  return ok({
    room,
    listing: { id: room.listing_id, title: custom.title, tradeType: custom.tradeType, salePrice: custom.salePrice, deposit: custom.deposit, rent: custom.rent },
    demo: !custom.ownerId,
  });
}
