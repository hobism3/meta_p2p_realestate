import { bad, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { decideProposal } from "@/lib/agreement-service";

/**
 * VS-4C 합의 응답. 인증 토큰의 사용자 ID로만 기록한다(타인 위조 금지).
 * AI 시연 동의는 서버가 제안 생성 시 자동 판정하므로 이 경로를 쓰지 않는다.
 */
export async function POST(req: Request, { params }: { params: { rid: string; pid: string } }): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "응답 권한 없음" }, 403);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const decision = String(parsed.value.decision ?? "");
  if (decision !== "agree" && decision !== "refuse") return bad("decision 오류");
  const version = parsed.value.version;
  const r = await decideProposal(
    params.rid,
    params.pid,
    a.identity.userId,
    decision,
    typeof version === "number" ? version : undefined,
  );
  if (!r.ok) return ok({ error: r.error }, r.status);
  return ok({ id: params.pid, status: r.status, version: r.version });
}
