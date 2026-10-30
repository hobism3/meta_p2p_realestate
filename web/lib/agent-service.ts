import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { disclosureLabel, draftReply, MOCK_PROMPT_VERSION, type AgentSide, type Scenario } from "./agent.ts";
import { FINAL_PRICE_NAME, offerHistoryName, wantHistoryName, parseJeonseValue, parseRentBundleValue, parseRentFields } from "./rent.ts";
import type { TradeType } from "./listings.ts";
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
import { parseManwonInt } from "./visit-dates.ts";

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
export interface DealStateCondition {
  name: string;
  value: string;
  proposer: string;
  status: string;
  confirmedBy: string;
}

export interface DealStateVisit {
  visit_date: string;
  visit_time: string;
  status: string;
}

function fmtVisitDate(isoDate: string): string {
  const m = isoDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${parseInt(m[2], 10)}월 ${parseInt(m[3], 10)}일`;
}

/**
 * 방의 최신 조건·일정을 모델용 한 줄 요약으로 만든다. 매수 희망·매도 제안·확인 여부를
 * 구분하고, 계약금 10% 기준액은 현재 협상가에서 서버가 직접 계산한다.
 */
function depositBase(value: string, tradeType: TradeType): number | null {
  if (tradeType === "매매") return parseManwonInt(value);
  const f = parseRentFields(value);
  if (f.deposit !== null) return f.deposit;
  return parseManwonInt(value);
}

export function formatDealState(
  conditions: DealStateCondition[],
  visits: DealStateVisit[],
  tradeType: TradeType = "매매",
): string {
  const lines: string[] = [];
  const byName = new Map(conditions.map((c) => [c.name, c]));
  const priceNames =
    tradeType === "매매"
      ? ["최초가", "매수 희망가", "매도 제안가"]
      : ["최초가", wantHistoryName(tradeType), offerHistoryName(tradeType), FINAL_PRICE_NAME[tradeType]];
  for (const n of priceNames) {
    const c = byName.get(n);
    if (c && c.value) lines.push(`- ${n}: ${c.value}${c.confirmedBy ? "(사용자 확인됨)" : "(미확정)"}`);
  }
  const dep = byName.get("계약금");
  if (dep && dep.value) lines.push(`- 계약금: ${dep.value}${dep.confirmedBy ? "(사용자 확인됨)" : "(제안)"}`);
  const baseNames =
    tradeType === "매매"
      ? ["매도 제안가", "매수 희망가", "최초가"]
      : [FINAL_PRICE_NAME[tradeType], offerHistoryName(tradeType), wantHistoryName(tradeType), "최초가"];
  for (const n of baseNames) {
    const c = byName.get(n);
    const cv = c?.value ?? "";
    const base = cv ? depositBase(cv, tradeType) : null;
    if (base) {
      lines.push(`- 계약금 10% 기준액: ${Math.round(base / 10).toLocaleString()}만원(${n} ${cv} 기준)`);
      break;
    }
  }
  const v = visits[0];
  if (v && v.visit_date) lines.push(`- 방문: ${fmtVisitDate(v.visit_date)}${v.visit_time ? ` ${v.visit_time}` : ""}(${v.status})`);
  for (const n of ["계약일", "잔금일", "인도일", "입주일"]) {
    const c = byName.get(n);
    if (c && c.value) lines.push(`- ${n}: ${c.value}${c.confirmedBy ? "(사용자 확인됨)" : "(미확정)"}`);
  }
  return lines.join("\n");
}

export function buildAgentInput(
  persona: string,
  label: string,
  facts: Record<string, string>,
  negotiable: Record<string, { min: number; max: number; unit: string }>,
  history: { author_type: string; author: string; text: string }[],
  voice?: ListingPersona | undefined,
  title?: string,
  dealState?: string,
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
    ...(dealState ? [`[거래 상태 — 아래 조건과 어긋나게 말하지 마]\n${dealState}`] : []),
    policyLine(voice?.policy),
    `협상 태도: ${voice ? voice.negotiation : "시연용으로 응대한다."}`,
    `실제 집주인처럼 자연스럽게 대화한다. [거래 상태]에 없는 일정·조건은 그럴듯하게 정해서 답해도 되지만, 이미 정해진 조건과 어긋나게 말하지 마. 바꾸려면 바꾼다고 먼저 말한다. 매수 제안을 받아들여도 된다. 정말 답할 수 없을 때만${voice ? ` '${voice.unknownResponse}'라고` : " '그 부분은 정해진 게 없어서 답하기 어렵습니다'라고"} 한 문장으로 답한다. '확인해 주세요', '확인이 필요', '직접 확인', '확인 바랍니다' 같은 말로 미루지 마. 같은 말을 반복하지 마. 등기부·법적 효력을 보장하지 마. 집톡이 메시지는 참고만 하고 네 발언으로 오인하지 마. 이전 가격 제안을 기억하고 맥락을 이어간다. 계약·예약·송금·등기를 완료한 것처럼 말하지 마. 방문 약속을 계약 확정으로 말하지 마. 계약금·잔금·인도·입주는 서로 다른 단계다.`,
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
  lease: Scenario["lease"];
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
      lease: undefined,
    };
  }
  if (!isDemoListing(listing)) return null;
  const s = scenarioFor(listing);
  return { persona: s.persona, label: demoName(listing.tradeType), side: s.side, facts: s.facts, negotiable: s.negotiable, lease: s.lease };
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
  lease: Scenario["lease"],
  triggerAt: string,
  tradeType: TradeType,
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
      const condRows = (await getDal().all(
        "SELECT name, value, proposer, status, confirmed_by FROM room_conditions WHERE room_id = ?",
        [roomId],
      )) as { name: string; value: string; proposer: string; status: string; confirmed_by: string }[];
      const visitRows = (await getDal().all(
        "SELECT visit_date, visit_time, status FROM visits WHERE room_id = ? ORDER BY created_at DESC LIMIT 3",
        [roomId],
      )) as { visit_date: string; visit_time: string; status: string }[];
      const dealState = formatDealState(
        condRows.map((r) => ({
          name: String(r.name ?? ""),
          value: String(r.value ?? ""),
          proposer: String(r.proposer ?? ""),
          status: String(r.status ?? ""),
          confirmedBy: String(r.confirmed_by ?? ""),
        })),
        visitRows.map((r) => ({
          visit_date: String(r.visit_date ?? ""),
          visit_time: String(r.visit_time ?? ""),
          status: String(r.status ?? ""),
        })),
        tradeType,
      );
      const input = buildAgentInput(persona, label, facts, negotiable, history, voice ?? undefined, title, dealState || undefined);
      const r = await callMeta(
        { system: input.system, messages: input.messages, maxTokens: META_MAX_TOKENS, timeoutMs: META_TIMEOUT_MS },
      );
      if (!r.ok) {
        if (r.kind === "no_key") return fail("모델 키 없음. 서버에 MODEL_API_KEY를 설정하세요.", 503, r.kind);
        if (r.kind === "timeout") return fail("모델 응답 시간 초과.", 502, r.kind);
        if (r.kind === "http") {
          return fail(`모델 오류(상태 ${r.status ?? "?"}${r.detail ? `: ${r.detail}` : ""}).`, 502, `${r.kind}:${r.status ?? "?"}`);
        }
        if (r.kind === "truncated") return fail("모델 응답이 길이 제한에 걸렸습니다. 다시 시도해 주세요.", 502, r.kind);
        if (r.kind === "network") return fail("모델 연결 실패.", 502, r.kind);
        return fail(r.detail ? `모델 응답 오류: ${r.detail}.` : "모델 호출 실패.", 502, r.kind);
      }
      text = r.text;
      usageJson = JSON.stringify({ inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
    } else {
      let leaseBaseline: { deposit: number | null; monthlyRent: number | null } | undefined;
      if (lease) {
        const baseRows = (await getDal().all(
          "SELECT name, value FROM room_conditions WHERE room_id = ? AND name IN (?, ?)",
          [roomId, wantHistoryName(lease.tradeType), offerHistoryName(lease.tradeType)],
        )) as { name: string; value: string }[];
        const pick = (side: "human" | "demo"): { deposit: number | null; monthlyRent: number | null } => {
          const nm = side === "human" ? wantHistoryName(lease.tradeType) : offerHistoryName(lease.tradeType);
          const row = baseRows.find((r) => String(r.name) === nm);
          const v = row ? String(row.value ?? "") : "";
          const b = parseRentBundleValue(v);
          if (b) return b;
          const j = parseJeonseValue(v);
          if (j !== null) return { deposit: j, monthlyRent: null };
          return parseRentFields(v);
        };
        const h = pick("human");
        const o = pick("demo");
        leaseBaseline = { deposit: h.deposit ?? o.deposit, monthlyRent: h.monthlyRent ?? o.monthlyRent };
      }
      text = draftReply({ persona, side, facts, negotiable, lease }, triggerText, { refISO: triggerAt, leaseBaseline }).text;
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
  let triggerAt: string;
  if (opts.triggerMessageId) {
    const t = await dal.get("SELECT id, text, author_type, created_at FROM messages WHERE id = ? AND room_id = ?", [
      opts.triggerMessageId,
      opts.roomId,
    ]);
    if (!t) return { ok: false, status: 404, error: "트리거 메시지 없음", provider, model };
    if (String(t.author_type ?? "human") !== "human") return { ok: false, status: 409, error: "트리거 없음", provider, model };
    triggerId = String(t.id);
    triggerText = String(t.text ?? "");
    triggerAt = String(t.created_at ?? "");
  } else {
    const last = await dal.get("SELECT id, text, author_type, created_at FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1", [
      opts.roomId,
    ]);
    if (!last || String(last.author_type ?? "human") !== "human") {
      return { ok: false, status: 409, error: "트리거 없음", provider, model };
    }
    triggerId = String(last.id);
    triggerText = String(last.text ?? "");
    triggerAt = String(last.created_at ?? "");
  }
  const listing = await listingForDemo(room.listing_id);
  if (!listing) return { ok: false, status: 404, error: "매물 없음", provider, model };
  const dealTradeType: TradeType =
    listing.tradeType === "전세" || listing.tradeType === "월세" ? listing.tradeType : "매매";
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
        voice, title, resolved.lease, triggerAt, dealTradeType,
      );
    }
    return { ok: false, status: 409, error: "처리 중", provider, model };
  }
  return executeRun(
    runId, opts.roomId, room.listing_id, triggerText,
    resolved.label, resolved.side, resolved.persona, resolved.facts, resolved.negotiable, provider, model,
    voice, title, resolved.lease, triggerAt, dealTradeType,
  );
}
