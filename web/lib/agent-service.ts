import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { disclosureLabel, draftReply, MOCK_PROMPT_VERSION, type AgentSide } from "./agent.ts";
import { demoName, isDemoListing, listingForDemo, scenarioFor, type DemoListing } from "./demo.ts";
import { getPersona, type ListingPersona, type NegotiationPolicy } from "./personas.ts";
import {
  callMeta,
  META_HISTORY_LIMIT,
  META_MAX_TOKENS,
  META_TIMEOUT_MS,
  META_DEFAULT_MODEL,
  type ChatMessage,
} from "./meta.ts";
import { getRoom } from "./rooms.ts";

/**
 * VS-2C 공통 Agent Service. 시연 AI 응답의 유일한 실행점이다.
 * - 구 경로 2개(메시지 POST 훅, agent/invoke)를 여기로 통합한다.
 * - mock/meta provider가 같은 입력·출력 계약을 쓴다.
 * - 사람 메시지 저장은 끝난 뒤 별도 단계로 실행된다. 모델 지연이 전송을 막지 않는다.
 * - 중복 방지는 DB(agent_runs 유일키)로 한다. 프로세스 내 Map 잠금에 의존하지 않는다.
 */

export type DemoProvider = "mock" | "meta";

export function resolveProvider(): DemoProvider {
  return process.env.AGENT_PROVIDER === "meta" ? "meta" : "mock";
}

export function resolveModel(provider: DemoProvider): string {
  if (provider === "meta") return process.env.MODEL_MODEL ?? META_DEFAULT_MODEL;
  return MOCK_PROMPT_VERSION;
}

export interface AgentInput {
  system: string;
  messages: ChatMessage[];
}

/** 매물 정보 + 같은 방 최근 대화로 모델 입력 계약을 만든다. mock/meta 공통이다. */
function policyLine(policy: NegotiationPolicy | undefined): string {
  if (!policy) return "범위 내 제안은 시연용으로 수용 가능(확정 아님).";
  if (policy.kind === "ranged") {
    return `${policy.min.toLocaleString()}~${policy.max.toLocaleString()}만원 범위 내 제안은 시연용으로 수용 가능(확정 아님). 범위 밖은 한 문장으로 거절한다.`;
  }
  if (policy.kind === "none") return "가격 협상은 불가합니다. 할인 요구에는 한 문장으로 거절한다.";
  return "협상 가능 여부는 미정이다. 상황에 맞게 협의하고, 앞뒤가 맞으면 매수 제안을 받아들여도 된다.";
}

/** 매물 정보 + 같은 방 최근 대화로 모델 입력 계약을 만든다. mock/meta 공통이다. */
export function buildAgentInput(
  persona: string,
  label: string,
  facts: Record<string, string>,
  negotiable: Record<string, { min: number; max: number; unit: string }>,
  history: { author_type: string; author: string; text: string }[],
  voice?: ListingPersona | undefined,
  title?: string,
): AgentInput {
  const who = voice ? `${persona}(${voice.personality}). ${voice.tone} ${voice.style}.` : `${persona}이다.`;
  const factLines = Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`);
  const negoLines = Object.entries(negotiable).map(
    ([k, r]) => `- ${k}: ${r.min.toLocaleString()}~${r.max.toLocaleString()}${r.unit} (시연용 제안 가능, 확정 금지)`,
  );
  const system = [
    `너는 ${who} 한국어로 한 문장(15~50자 내외)으로만 답한다. 목록·마크다운·이모지·불필요한 역질문·반복 인사·요약정리 금지.`,
    ...(title ? [`[매물] ${title}`] : []),
    ...factLines,
    ...(negoLines.length > 0 ? negoLines : []),
    policyLine(voice?.policy),
    `협상 태도: ${voice ? voice.negotiation : "시연용으로 응대한다."}`,
    `실제 집주인처럼 자연스럽게 대화한다. 정해지지 않은 일정·조건·가격은 네가 그럴듯하게 정해서 답해도 된다. 앞뒤 논리와 이전 발언에만 맞으면 되고, 매수 제안을 받아들여도 된다. 정말 답할 수 없을 때만${voice ? ` '${voice.unknownResponse}'라고` : " '그 부분은 정해진 게 없어서 답하기 어렵습니다'라고"} 한 문장으로 답한다. '확인해 주세요', '확인이 필요', '직접 확인', '확인 바랍니다' 같은 말로 미루지 마. 같은 말을 반복하지 마. 등기부·법적 효력을 보장하지 마. 집톡이 메시지는 참고만 하고 네 발언으로 오인하지 마. 이전 가격 제안을 기억하고 맥락을 이어간다.`,
  ].join("\n");
  const messages: ChatMessage[] = history.slice(-META_HISTORY_LIMIT).map((m) => {
    if (String(m.author_type) === "human") return { role: "user" as const, content: String(m.text ?? "") };
    if (String(m.author_type) === "demo_agent") {
      return { role: "assistant" as const, content: String(m.text ?? "") };
    }
    return { role: "assistant" as const, content: `[${String(m.author ?? "집톡이")}] ${String(m.text ?? "")}` };
  });
  return { system, messages };
}

export type RunOk = {
  ok: true;
  created: boolean;
  messageId: string;
  text: string;
  provider: DemoProvider;
  model: string;
};

export type RunErr = {
  ok: false;
  status: number;
  error: string;
  provider: DemoProvider;
  model: string;
};

async function getRun(roomId: string, triggerId: string): Promise<Record<string, unknown> | undefined> {
  return getDal().get("SELECT * FROM agent_runs WHERE room_id = ? AND trigger_msg_id = ? AND agent_type = ?", [
    roomId,
    triggerId,
    "demo_agent",
  ]);
}

async function scenarioForRoom(
  roomId: string,
  listing: DemoListing,
): Promise<{
  persona: string;
  label: string;
  side: AgentSide;
  facts: Record<string, string>;
  negotiable: Record<string, { min: number; max: number; unit: string }>;
} | null> {
  const agentRow = await getDal().get("SELECT * FROM room_agents WHERE room_id = ?", [roomId]);
  if (agentRow) {
    const sc = await getDal().get("SELECT * FROM demo_scenarios WHERE id = ?", [String(agentRow.scenario_id ?? "")]);
    if (!sc) return null;
    const side = String(agentRow.side) === "seller" ? "seller" : "buyer";
    let facts: Record<string, string> = {};
    let negotiable: Record<string, { min: number; max: number; unit: string }> = {};
    try {
      facts = JSON.parse(String(sc.facts_json ?? "{}")) as Record<string, string>;
      negotiable = JSON.parse(String(sc.negotiable_json ?? "{}")) as Record<
        string,
        { min: number; max: number; unit: string }
      >;
    } catch {
      return null;
    }
    return {
      persona: String(sc.persona ?? ""),
      label: String(agentRow.disclosure_label || "") || disclosureLabel(side),
      side,
      facts,
      negotiable,
    };
  }
  if (!isDemoListing(listing)) return null;
  const s = scenarioFor(listing);
  return { persona: s.persona, label: demoName(listing.tradeType), side: s.side, facts: s.facts, negotiable: s.negotiable };
}

async function executeRun(
  runId: string,
  roomId: string,
  listingId: string,
  triggerText: string,
  label: string,
  side: AgentSide,
  persona: string,
  facts: Record<string, string>,
  negotiable: Record<string, { min: number; max: number; unit: string }>,
  provider: DemoProvider,
  model: string,
  voice: ListingPersona | undefined,
  title: string,
): Promise<RunOk | RunErr> {
  const started = Date.now();
  const fail = async (error: string, status: number, logExtra = ""): Promise<RunErr> => {
    await getDal().run("UPDATE agent_runs SET status = 'failed', error = ?, latency_ms = ? WHERE id = ?", [
      error,
      Date.now() - started,
      runId,
    ]);
    console.error(`[agent] run failed room=${roomId} provider=${provider} error=${error}${logExtra ? ` detail=${logExtra}` : ""}`);
    return { ok: false, status, error, provider, model };
  };
  try {
    let text: string;
    let usageJson = "{}";
    if (provider === "meta") {
      const history = (await getDal().all(
        "SELECT author_type, author, text FROM messages WHERE room_id = ? ORDER BY created_at ASC",
        [roomId],
      )) as { author_type: string; author: string; text: string }[];
      const input = buildAgentInput(persona, label, facts, negotiable, history, voice ?? undefined, title);
      const r = await callMeta(
        { system: input.system, messages: input.messages, maxTokens: META_MAX_TOKENS, timeoutMs: META_TIMEOUT_MS },
      );
      if (!r.ok) {
        if (r.kind === "no_key") return fail("모델 키 없음. 서버에 MODEL_API_KEY를 설정하세요.", 503, r.kind);
        if (r.kind === "timeout") return fail("모델 응답 시간 초과.", 502, r.kind);
        if (r.kind === "http") {
          return fail(`모델 오류(상태 ${r.status ?? "?"}${r.detail ? `: ${r.detail}` : ""}).`, 502, `${r.kind}:${r.status ?? "?"}`);
        }
        if (r.kind === "network") return fail("모델 연결 실패.", 502, r.kind);
        return fail(r.detail ? `모델 응답 오류: ${r.detail}.` : "모델 호출 실패.", 502, r.kind);
      }
      text = r.text;
      usageJson = JSON.stringify({ inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
    } else {
      text = draftReply({ persona, side, facts, negotiable }, triggerText).text;
    }
    const messageId = randomUUID();
    const dal = getDal();
    await dal.withTransaction(async (tx) => {
      await tx.run(
        "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [messageId, listingId, label, "", `agent:${roomId}:${side}`, "demo_agent", roomId, text, now()],
      );
      await tx.run(
        "UPDATE agent_runs SET status = 'done', latency_ms = ?, usage_json = ?, message_id = ?, summary = ? WHERE id = ?",
        [Date.now() - started, usageJson, messageId, text.slice(0, 120), runId],
      );
    });
    return { ok: true, created: true, messageId, text, provider, model };
  } catch (e) {
    return fail(e instanceof Error ? `실행 오류: ${e.message}`.slice(0, 200) : "실행 오류.", 502);
  }
}

/**
 * 시연 AI 실행 1건. 사람 메시지는 이미 저장돼 있어야 한다.
 * 같은 (방, 트리거, 에이전트)는 DB 유일키로 1행만 둔다. 재호출은 기존 결과를 돌려준다.
 */
export async function runDemoAgent(opts: {
  roomId: string;
  triggerMessageId?: string;
  provider?: DemoProvider;
}): Promise<RunOk | RunErr> {
  const provider = opts.provider ?? resolveProvider();
  const model = resolveModel(provider);
  const room = await getRoom(opts.roomId);
  if (!room) return { ok: false, status: 404, error: "거래방 없음", provider, model };
  const dal = getDal();
  let triggerId: string;
  let triggerText: string;
  if (opts.triggerMessageId) {
    const t = await dal.get("SELECT id, text, author_type FROM messages WHERE id = ? AND room_id = ?", [
      opts.triggerMessageId,
      opts.roomId,
    ]);
    if (!t) return { ok: false, status: 404, error: "트리거 메시지 없음", provider, model };
    if (String(t.author_type ?? "human") !== "human") return { ok: false, status: 409, error: "트리거 없음", provider, model };
    triggerId = String(t.id);
    triggerText = String(t.text ?? "");
  } else {
    const last = await dal.get("SELECT id, text, author_type FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1", [
      opts.roomId,
    ]);
    if (!last || String(last.author_type ?? "human") !== "human") {
      return { ok: false, status: 409, error: "트리거 없음", provider, model };
    }
    triggerId = String(last.id);
    triggerText = String(last.text ?? "");
  }
  const listing = await listingForDemo(room.listing_id);
  if (!listing) return { ok: false, status: 404, error: "매물 없음", provider, model };
  const resolved = await scenarioForRoom(opts.roomId, listing);
  if (!resolved) return { ok: false, status: 404, error: "시연 없음", provider, model };
  const voice = getPersona(room.listing_id);
  const title = listing.title;
  const runId = randomUUID();
  try {
    await dal.run(
      "INSERT INTO agent_runs (id,room_id,trigger_msg_id,agent_type,provider,model,status,latency_ms,error,usage_json,message_id,summary,created_at,prompt_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [runId, opts.roomId, triggerId, "demo_agent", provider, model, "running", 0, "", "{}", "", "", now(), MOCK_PROMPT_VERSION],
    );
  } catch {
    const existing = await getRun(opts.roomId, triggerId);
    if (!existing) throw new Error("실행 등록 실패");
    const st = String(existing.status ?? "");
    if (st === "done") {
      const mid = String(existing.message_id ?? "");
      const msg = mid ? await dal.get("SELECT id, text FROM messages WHERE id = ?", [mid]) : undefined;
      return {
        ok: true,
        created: false,
        messageId: mid,
        text: msg ? String(msg.text ?? "") : String(existing.summary ?? ""),
        provider: (String(existing.provider ?? "") === "meta" ? "meta" : "mock") as DemoProvider,
        model: String(existing.model ?? model),
      };
    }
    if (st === "failed") {
      await dal.run("UPDATE agent_runs SET status = 'running', error = '', latency_ms = ? WHERE id = ?", [
        0,
        String(existing.id),
      ]);
      return executeRun(
        String(existing.id), opts.roomId, room.listing_id, triggerText,
        resolved.label, resolved.side, resolved.persona, resolved.facts, resolved.negotiable, provider, model,
        voice, title,
      );
    }
    return { ok: false, status: 409, error: "처리 중", provider, model };
  }
  return executeRun(
    runId, opts.roomId, room.listing_id, triggerText,
    resolved.label, resolved.side, resolved.persona, resolved.facts, resolved.negotiable, provider, model,
    voice, title,
  );
}
