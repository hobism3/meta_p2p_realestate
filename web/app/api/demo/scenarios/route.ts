import { randomUUID } from "node:crypto";
import { bad, guardWrite, listingExists, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";
import { getRoom, isRoomMember } from "@/lib/rooms";

/**
 * 시연용 시나리오 등록. 로컬·테스트 전용(ALLOW_DEMO_SETUP=true).
 * 운영에는 플래그를 두지 않으므로 항상 403이다.
 */
export async function POST(req: Request): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  if (process.env.ALLOW_DEMO_SETUP !== "true") return ok({ error: "시연 설정 불가" }, 403);
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const b = parsed.value;
  const roomId = String(b.roomId ?? "");
  const side = String(b.side ?? "");
  if (!roomId || (side !== "seller" && side !== "buyer")) return bad("방·측 필수");
  const room = await getRoom(roomId);
  if (!room) return notFound("거래방 없음");
  if (!(await isRoomMember(roomId, a.identity.userId))) return ok({ error: "설정 권한 없음" }, 403);
  if (!(await listingExists(room.listing_id))) return notFound("매물 없음");
  const facts = b.facts && typeof b.facts === "object" ? b.facts : {};
  const negotiable = b.negotiable && typeof b.negotiable === "object" ? b.negotiable : {};
  const scenarioId = randomUUID();
  const dal = getDal();
  await dal.withTransaction(async (tx) => {
    await tx.run(
      "INSERT INTO demo_scenarios (id,listing_id,persona,facts_json,negotiable_json,created_at) VALUES (?,?,?,?,?,?)",
      [scenarioId, room.listing_id, String(b.persona ?? ""), JSON.stringify(facts), JSON.stringify(negotiable), now()],
    );
    await tx.run(
      "INSERT INTO room_agents (room_id,side,scenario_id,disclosure_label) VALUES (?,?,?,?) ON CONFLICT(room_id,side) DO UPDATE SET scenario_id=excluded.scenario_id, disclosure_label=excluded.disclosure_label",
      [roomId, side, scenarioId, side === "seller" ? "AI 매도자(시연)" : "AI 매수자(시연)"],
    );
  });
  return ok({ scenario_id: scenarioId }, 201);
}
