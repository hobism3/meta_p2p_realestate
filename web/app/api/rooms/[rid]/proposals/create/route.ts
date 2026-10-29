import { bad, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { createProposals, PROPOSABLE } from "@/lib/agreement-service";

/**
 * VS-4C 수동 제안 생성. 집톡이가 돌지 않는 실거래방에서 사람이 직접 카드를 만든다.
 * 버전·superseded·중복 규칙은 자동 생성과 동일하다. AI 시연 판정은 시연방에만 적용된다.
 */
export async function POST(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "생성 권한 없음" }, 403);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const name = String(parsed.value.name ?? "").trim();
  const value = String(parsed.value.value ?? "").trim();
  if (!name || !PROPOSABLE.includes(name)) return bad("조건명 오류");
  if (!value || value.length > 500) return bad("값 오류");
  const ev = Array.isArray(parsed.value.source_msg_ids) ? parsed.value.source_msg_ids.filter((x: unknown) => typeof x === "string") : [];
  let evidence: string[] = [];
  if (ev.length > 0) {
    const rows = (await getDal().all(`SELECT id FROM messages WHERE room_id = ? AND id IN (${ev.map(() => "?").join(",")})`, [
      params.rid,
      ...ev,
    ])) as { id: string }[];
    evidence = rows.map((r) => String(r.id));
  }
  const created = await createProposals(params.rid, [{ name, value, evidence }], "human");
  if (created.length === 0) return bad("제안 생성 실패");
  return ok({ id: created[0].id, status: created[0].status, version: created[0].version }, 201);
}
