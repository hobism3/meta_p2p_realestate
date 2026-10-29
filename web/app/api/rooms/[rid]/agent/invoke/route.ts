import { guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { runDemoAgent } from "@/lib/agent-service";

// 방 에이전트 상태 조회. 모드·시나리오·표시 라벨을 돌려준다.
export async function GET(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "조회 권한 없음" }, 403);
  const agents = await getDal().all("SELECT side, disclosure_label FROM room_agents WHERE room_id = ?", [
    params.rid,
  ]);
  return ok({ room_id: params.rid, agents });
}

/**
 * 시연 AI 실행 1건. 공통 Agent Service로 처리한다.
 * 사람 메시지는 이미 저장돼 있어야 한다. 모델 지연이 전송을 막지 않는다.
 * 같은 트리거 재호출은 기존 결과를 돌려준다(중복 생성 없음).
 * provider는 서버 설정만 사용한다. 클라이언트가 지정할 수 없다.
 */
export async function POST(req: Request, { params }: { params: { rid: string } }): Promise<Response> {
  const w = guardWrite(req);
  if (w) return w;
  const room = await getRoom(params.rid);
  if (!room) return notFound("거래방 없음");
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  if (!(await isRoomMember(params.rid, a.identity.userId))) return ok({ error: "호출 권한 없음" }, 403);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const trigger = parsed.value.trigger_message_id;
  const result = await runDemoAgent({
    roomId: params.rid,
    triggerMessageId: typeof trigger === "string" && trigger ? trigger : undefined,
  });
  if (!result.ok) return ok({ error: result.error, provider: result.provider, model: result.model }, result.status);
  return ok(
    { id: result.messageId, text: result.text, provider: result.provider, model: result.model },
    result.created ? 201 : 200,
  );
}
