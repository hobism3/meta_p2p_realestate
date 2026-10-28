import { getDal } from "./dal";

/**
 * M1-A 권한. 토큰의 user_metadata.role은 절대 사용하지 않는다.
 * 규칙: 매물 소유자는 landlord, 그 외 참여자는 tenant. 방 단위 분리는 M1-B.
 */

export async function listingOwnerId(listingId: string): Promise<string | null> {
  const r = await getDal().get("SELECT owner_id FROM custom_listings WHERE id = ?", [listingId]);
  if (!r) return null;
  const v = String(r.owner_id ?? "");
  return v ? v : null;
}

export async function isListingOwner(listingId: string, userId: string): Promise<boolean> {
  const o = await listingOwnerId(listingId);
  return o !== null && o === userId;
}

export async function participantRole(
  listingId: string,
  userId: string,
): Promise<"landlord" | "tenant"> {
  return (await isListingOwner(listingId, userId)) ? "landlord" : "tenant";
}

export async function recordParticipant(
  listingId: string,
  userId: string,
  role: "landlord" | "tenant",
): Promise<void> {
  await getDal().run(
    "INSERT INTO listing_participants (listing_id,user_id,role) VALUES (?,?,?) ON CONFLICT(listing_id,user_id) DO UPDATE SET role=excluded.role",
    [listingId, userId, role],
  );
}
