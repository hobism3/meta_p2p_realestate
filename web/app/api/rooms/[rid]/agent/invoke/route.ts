import { randomUUID } from "node:crypto";
import { bad, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { disclosureLabel, draftReply, MOCK_PROMPT_VERSION, type AgentSide } from "@/lib/agent";
import { getDal } from "@/lib/dal";
import { now } from "@/lib/db";
import { getRoom, isRoomMember } from "@/lib/rooms";

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
 * 시연용 AI 응답 1건 생성.
 * 루프 가드: 마지막 메시지가 human이 아니면 409로 거부한다(AI 작성에 무반응).
 * 시나리오가 없으면 404. 멤버가 아니면 403, 무인증은 401.
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
  const agentRows = await getDal().all("SELECT * FROM room_agents WHERE room_id = ?", [params.rid]);
  if (agentRows.length === 0) return notFound("시나리오 없음");
  const agent = agentRows[0] as { side: string; scenario_id: string; disclosure_label: string };
  const side = (agent.side === "seller" ? "seller" : "buyer") as AgentSide;
  const sc = await getDal().get("SELECT * FROM demo_scenarios WHERE id = ?", [agent.scenario_id]);
  if (!sc) return notFound("시나리오 없음");
  const last = (await getDal().all(
    "SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1",
    [params.rid],
  ))[0] as { id: string; author_type: string; text: string } | undefined;
  if (!last || String(last.author_type ?? "human") !== "human") {
    return ok({ error: "트리거 없음" }, 409);
  }
  const scenario = {
    persona: String(sc.persona ?? ""),
    side,
    facts: JSON.parse(String(sc.facts_json ?? "{}")) as Record<string, string>,
    negotiable: JSON.parse(String(sc.negotiable_json ?? "{}")) as Record<
      string,
      { min: number; max: number; unit: string }
    >,
  };
  const reply = draftReply(scenario, String(last.text ?? ""));
  const label = agent.disclosure_label || disclosureLabel(side);
  const id = randomUUID();
  const dal = getDal();
  await dal.withTransaction(async (tx) => {
    await tx.run(
      "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, room.listing_id, label, "", `agent:${params.rid}:${side}`, "demo_agent", params.rid, reply.text, now()],
    );
    await tx.run(
      "INSERT INTO agent_runs (id,room_id,agent_type,trigger_msg_id,prompt_version,provider,summary,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [randomUUID(), params.rid, "demo_agent", String(last.id ?? ""), MOCK_PROMPT_VERSION, "mock", reply.text.slice(0, 200), now()],
    );
  });
  return ok({ id, text: reply.text, proposal: reply.proposal, needsHuman: reply.needsHuman }, 201);
}
