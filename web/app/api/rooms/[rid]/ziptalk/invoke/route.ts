import { guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getRoom, isRoomMember } from "@/lib/rooms";
import { runZiptalk } from "@/lib/ziptalk-service";

/**
 * VS-3A 집톡이 분석 호출. 매도자 invoke와 같은 수호 규칙(방 멤버·시연방만)을 쓴다.
 * provider는 서버 설정만 사용한다. 클라이언트가 지정할 수 없다.
 * 조용하면 200에 bubble 없이, 개입하면 201에 말풍선 ID를 돌려준다.
 */
export async function POST(req: Request, { params }: { params: { rid: string } }) {
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
  const r = await runZiptalk({
    roomId: params.rid,
    triggerMessageId: typeof trigger === "string" && trigger ? trigger : undefined,
  });
  if (!r.ok) return ok({ error: r.error, provider: r.provider, model: r.model }, r.status);
  return ok(
    {
      bubble_message_id: r.bubbleMessageId,
      applied: r.applied,
      created: r.created,
      provider: r.provider,
      model: r.model,
    },
    r.created ? 201 : 200,
  );
}
