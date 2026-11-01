import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";

/**
 * Serverless-safe booking expiration: perform a bounded sweep when the owner
 * opens the inbox, a room loads slots, or a booking is changed/created.
 * No cron, frontend clock, or unauthenticated global cleanup endpoint.
 *
 * The actual DB status remains 'cancelled' (original migration CHECK), with
 * decided_by='system:expired' differentiating it from a user cancellation.
 */
export const PENDING_BOOKING_TTL_HOURS = 24;
export const EXPIRED_BY = "system:expired";
export type BookingScope = { listingId: string } | { ownerId: string };
export type BookingDisplayStatus = "requested" | "confirmed" | "declined" | "cancelled" | "expired";

export function expirationCutoff(nowAt: Date = new Date()): string {
  return new Date(nowAt.getTime() - PENDING_BOOKING_TTL_HOURS * 3600_000).toISOString();
}
export function displayBookingStatus(b: {status: string; decided_by?: string | null}): BookingDisplayStatus {
  if (b.status === "cancelled" && b.decided_by === EXPIRED_BY) return "expired";
  return b.status as BookingDisplayStatus;
}
/**
 * Every expired request is transitioned and has its two slot locks removed
 * within the SAME database transaction. UPDATE ... RETURNING ensures an
 * owner confirmation and expiration cannot both win.
 */
export async function expirePendingBookings(scope: BookingScope, at: Date = new Date()): Promise<number> {
  // The emergency READ_ONLY guard must also cover incidental writes on GET.
  if (process.env.READ_ONLY === "true") return 0;
  const cutoff = expirationCutoff(at), stamp = now();
  const listingScope = "listingId" in scope;
  const filter = listingScope ? "b.listing_id = ?" : "l.owner_id = ?";
  const key = listingScope ? scope.listingId : scope.ownerId;
  const db = getDal();
  return db.withTransaction(async tx => {
    const rows = await tx.all(
      `SELECT b.id,b.listing_id,b.room_id,b.visit_date,b.visit_time
         FROM owner_visit_bookings b
         JOIN custom_listings l ON l.id=b.listing_id
        WHERE ${filter} AND b.status='requested' AND b.created_at <= ?
        ORDER BY b.created_at ASC LIMIT 100`,
      [key,cutoff],
    );
    let count = 0;
    for(const b of rows) {
      const id=String(b.id);
      const updated=await tx.get(
        "UPDATE owner_visit_bookings SET status='cancelled',decided_by=?,updated_at=? WHERE id=? AND status='requested' AND created_at <= ? RETURNING id",
        [EXPIRED_BY,stamp,id,cutoff],
      );
      if (!updated) continue;
      await tx.run("DELETE FROM owner_visit_slot_locks WHERE booking_id=?", [id]);
      await tx.run(
        "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [randomUUID(),String(b.listing_id),"방문 일정 알림","","system:booking","booking_notice",
          String(b.room_id),
          `방문 예약 만료: ${String(b.visit_date)} ${String(b.visit_time)} (한국 시간) · 집주인 승인 대기 24시간이 지나 자동 만료됐습니다. 새로운 방문 일정을 신청할 수 있습니다.`,
          stamp],
      );
      count++;
    }
    return count;
  });
}
