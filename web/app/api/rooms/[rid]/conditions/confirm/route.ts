import { guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { confirmCondition } from "@/lib/ziptalk-service";

/**
 * VS-3B 조건 사용자 확인. 현재 버전을 인증된 사용자 ID로 기록한다.
 * AI·집톡이는 이 경로를 쓸 수 없다(신원은 토큰에서만 온다).
 * 값이 바뀌면 version이 올라 이전 확인은 무효가 된다.
 */
export async function POST(req: Request, { params }: { params: { rid: string } }) {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "확인 권한 없음" }, 403);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const name = parsed.value.name;
  if (typeof name !== "string" || !name.trim()) return ok({ error: "조건명 필요" }, 400);
  const r = await confirmCondition(params.rid, name.trim(), a.identity.userId);
  if (!r.ok) return ok({ error: r.error }, r.status);
  return ok({ name: name.trim(), version: r.version, confirmed_by: a.identity.userId });
}
