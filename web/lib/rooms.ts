import { randomUUID } from "node:crypto";
import { getDal } from "./dal";
import { now } from "./db";
import { isListingOwner, participantRole } from "./authz";

/**
 * M1-B 독립 거래방. 같은 매물에도 방마다 멤버가 다르다(A-B와 A-C 분리).
 * 권한은 room_members + 매물 소유자 기록으로만 판단한다.
 * 토큰 user_metadata.role과 사용자 입력 role은 절대 쓰지 않는다.
 */

export interface Room {
  id: string;
  listing_id: string;
  created_by: string;
  created_at: string;
}

export async function getRoom(roomId: string): Promise<Room | undefined> {
  const r = await getDal().get("SELECT * FROM deal_rooms WHERE id = ?", [roomId]);
  return r as unknown as Room | undefined;
}

export async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const r = await getDal().get("SELECT 1 AS one FROM room_members WHERE room_id = ? AND user_id = ?", [
    roomId,
    userId,
  ]);
  return r !== undefined;
}

async function addMember(roomId: string, userId: string, role: "landlord" | "tenant"): Promise<void> {
  await getDal().run(
    "INSERT INTO room_members (room_id,user_id,role) VALUES (?,?,?) ON CONFLICT(room_id,user_id) DO NOTHING",
    [roomId, userId, role],
  );
}

/**
 * 방 생성. 생성자를 멤버로 기록하고, 매물 소유자가 있으면 함께 넣는다.
 * 같은 매물·같은 사람이어도 호출할 때마다 새 방이 생긴다(중복 문의 허용, M1-C에서 정리).
 */
export async function createRoom(listingId: string, creatorId: string): Promise<Room> {
  const id = randomUUID();
  const createdAt = now();
  const dal = getDal();
  await dal.withTransaction(async (tx) => {
    await tx.run("INSERT INTO deal_rooms (id,listing_id,created_by,created_at) VALUES (?,?,?,?)", [
      id,
      listingId,
      creatorId,
      createdAt,
    ]);
    const creatorRole = await participantRole(listingId, creatorId);
    await tx.run("INSERT INTO room_members (room_id,user_id,role) VALUES (?,?,?)", [
      id,
      creatorId,
      creatorRole,
    ]);
    if (!(await isListingOwner(listingId, creatorId))) {
      const owner = await ownerOf(listingId);
      if (owner) {
        await tx.run("INSERT INTO room_members (room_id,user_id,role) VALUES (?,?,?)", [
          id,
          owner,
          "landlord",
        ]);
      }
    }
  });
  return { id, listing_id: listingId, created_by: creatorId, created_at: createdAt };
}

async function ownerOf(listingId: string): Promise<string | null> {
  const r = await getDal().get("SELECT owner_id FROM custom_listings WHERE id = ?", [listingId]);
  if (!r) return null;
  const v = String(r.owner_id ?? "");
  return v ? v : null;
}

/** 내 방 목록. 소유자는 매물의 전 방, 나머지는 멤버인 방만 본다. */
export async function visibleRooms(listingId: string, userId: string): Promise<Room[]> {
  if (await isListingOwner(listingId, userId)) {
    return (await getDal().all("SELECT * FROM deal_rooms WHERE listing_id = ? ORDER BY created_at ASC", [
      listingId,
    ])) as unknown as Room[];
  }
  return (await getDal().all(
    "SELECT r.* FROM deal_rooms r JOIN room_members m ON m.room_id = r.id WHERE r.listing_id = ? AND m.user_id = ? ORDER BY r.created_at ASC",
    [listingId, userId],
  )) as unknown as Room[];
}

export { addMember };
