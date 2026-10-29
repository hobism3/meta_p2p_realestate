import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { classify, extractPriceManwon, hasJudgment } from "./ziptalk.ts";
import { parseVisitProposal } from "./visit-dates.ts";
import {
  callMeta,
  META_HISTORY_LIMIT,
  META_MAX_TOKENS,
  META_TIMEOUT_MS,
  META_DEFAULT_MODEL,
  type ChatMessage,
} from "./meta.ts";
import { isDemoListing, listingForDemo } from "./demo.ts";
import { getRoom } from "./rooms.ts";
import { resolveProvider, type DemoProvider } from "./agent-service.ts";

/**
 * VS-3A 집톡이(중립 거래 정리). AI 매도자·임대인(DEMO)과 별개다.
 * 협상·확정은 절대 하지 않는다. 조건 기록과 미확인 안내만 한다.
 * 작성자 유형은 스펙대로 assistant + author 집톡이. 사람으로 위장하지 않는다.
 * mock/meta가 같은 입력·출력 계약을 쓴다. 사람·매도자 흐름과 분리 실행된다.
 */

export const ZIPTALK_VERSION = "ziptalk-v1";
export const ZIPTALK_AUTHOR = "집톡이";
export const ZIPTALK_BUBBLE_LIMIT = 200;

export type ConditionStatus = "proposed" | "unconfirmed" | "confirmed";

export interface TriggerMsg {
  id: string;
  author_type: string;
  author: string;
  text: string;
  created_at: string;
}

export interface StoredCondition {
  name: string;
  value: string;
  proposer: string;
  status: string;
  confirmedBy: string;
  confirmedVersion: number;
}

export interface ConditionUpsert {
  name: string;
  value: string;
  proposer: "human" | "demo";
  status: ConditionStatus;
  evidence: string[];
}

export interface AnalysisOutcome {
  upserts: ConditionUpsert[];
  intervene: boolean;
  bubble: string | null;
}

function priceText(manwom: number): string {
  return `${manwom.toLocaleString()}만원`;
}

/**
 * 정규식 기반 mock 분석. lib/ziptalk.ts를 테스트 기준선으로 쓴다.
 * 확정(confirmed)은 절대 만들지 않는다. 근거 없는 조건도 만들지 않는다.
 */
export function analyzeMock(
  trigger: TriggerMsg,
  current: Map<string, StoredCondition>,
  refISO = "",
): AnalysisOutcome {
  const t = trigger.text.trim();
  const proposer = trigger.author_type === "human" ? "human" : "demo";
  const silent = { upserts: [], intervene: false, bubble: null };
  if (hasJudgment(t)) return silent;
  const cls = classify(t);
  const price = extractPriceManwon(t);
  // 매수자 희망가와 매도자 제안가는 별도 조건으로 유지한다. 서로 다른 가격을 자동 충돌·합의로 보지 않는다.
  const pname = proposer === "human" ? "매수 희망가" : "매도 제안가";
  if (cls === "proposal" && price !== null) {
    const v = priceText(price);
    const cur = current.get(pname);
    if (!cur || !cur.value) {
      return {
        upserts: [{ name: pname, value: v, proposer, status: "proposed", evidence: [trigger.id] }],
        intervene: true,
        bubble: `가격이 ${v}으로 새로 제안됐어요. 아직 확정되지는 않았습니다.`,
      };
    }
    if (cur.value !== v) {
      return {
        upserts: [{ name: pname, value: v, proposer, status: "proposed", evidence: [trigger.id] }],
        intervene: true,
        bubble: `가격이 ${cur.value}에서 ${v}로 변경됐어요. 아직 확정되지는 않았습니다.`,
      };
    }
    return silent;
  }
  if (cls === "withdraw") {
    const wcur = current.get(pname);
    if (wcur && wcur.status === "proposed") {
      return {
        upserts: [{ name: pname, value: wcur.value, proposer: wcur.proposer === "demo" ? "demo" : "human", status: "unconfirmed", evidence: [trigger.id] }],
        intervene: true,
        bubble: "가격 제안을 거둬들였습니다.",
      };
    }
    return silent;
  }
  if (t.includes("방문") || t.includes("보러") || t.includes("구경")) {
    const v = parseVisitProposal(t, refISO || trigger.created_at);
    if (v) {
      return {
        upserts: [{ name: "방문일", value: v.display, proposer, status: "proposed", evidence: [trigger.id] }],
        intervene: true,
        bubble: v.time
          ? `방문일로 ${v.display}가 제안됐어요. 거래 현황에서 확인해 주세요.`
          : `방문일로 ${v.display} 이야기가 나왔어요. 시간을 정해 주세요.`,
      };
    }
  }
  if (cls === "question") {
    if (t.includes("입주")) {
      const ic = current.get("입주일");
      if (!ic || !ic.value) {
        return {
          upserts: [{ name: "입주일", value: "", proposer, status: "unconfirmed", evidence: [trigger.id] }],
          intervene: true,
          bubble: "입주일은 아직 확인되지 않았어요.",
        };
      }
      if (ic && ic.value) {
        return { upserts: [], intervene: true, bubble: `입주일은 ${ic.value}입니다.` };
      }
      return silent;
    }
    const slots: Array<[string, string]> = [
      ["방문", "방문일"],
      ["계약", "계약일"],
      ["잔금", "잔금일"],
      ["옵션", "옵션"],
      ["수리", "수리 요청"],
    ];
    for (let i = 0; i < slots.length; i++) {
      if (t.includes(slots[i][0])) {
        const sc = current.get(slots[i][1]);
        if (!sc || !sc.value) {
          return {
            upserts: [{ name: slots[i][1], value: "", proposer, status: "unconfirmed", evidence: [trigger.id] }],
            intervene: true,
            bubble: `${slots[i][1]}은 아직 확인되지 않았어요.`,
          };
        }
        if (sc && sc.value) {
          return { upserts: [], intervene: true, bubble: `${slots[i][1]}은 ${sc.value}입니다.` };
        }
        return silent;
      }
    }
    if (t.includes("가격") || t.includes("얼마") || t.includes("보증금") || t.includes("월세") || t.includes("매매가")) {
      const w = current.get("매수 희망가");
      const o = current.get("매도 제안가");
      if ((!w || !w.value) && (!o || !o.value)) {
        const f0 = current.get("최초가");
        if (f0 && f0.value) {
          return { upserts: [], intervene: true, bubble: `최초가는 ${f0.value}입니다.` };
        }
        // 가격 질문은 조건을 만들지 않고 안내만 한다. 제안이 나와야 기록된다.
        return { upserts: [], intervene: true, bubble: "가격은 아직 확인되지 않았어요. 희망가를 말씀해 보세요." };
      }
      const bits: string[] = [];
      const f = current.get("최초가");
      if (f && f.value) bits.push(`최초가는 ${f.value}`);
      if (w && w.value) bits.push(`매수 희망가는 ${w.value}`);
      if (o && o.value) bits.push(`매도 제안은 ${o.value}`);
      return { upserts: [], intervene: true, bubble: `${bits.join(", ")}입니다.` };
    }
  }
  return silent;
}

export interface ValidatedCondition {
  name: string;
  value: string;
  proposer: "human" | "demo";
  status: "proposed" | "unconfirmed";
  evidence: string[];
}

export interface ValidatedAnalysis {
  conditions: ValidatedCondition[];
  intervene: boolean;
  bubble: string | null;
}

/** 금액 표기를 만원 정수로 정규화한다. 파싱 불가면 원문을 둔다(지어내지 않음). */
export function normalizeValue(raw: string): string {
  const v = raw.trim();
  if (!/\d/.test(v) || !/[만억원]/.test(v)) return v;
  const s = v.replace(/원/g, "");
  let total = 0;
  let seen = false;
  const parts = s.split("억");
  const parseMan = (t: string): number => {
    const m = t.match(/([\d,]+(?:\.\d+)?)\s*만?/);
    if (!m) return 0;
    return parseFloat(m[1].replace(/,/g, ""));
  };
  if (parts.length === 2) {
    const eok = parseFloat((parts[0].match(/[\d,]+(?:\.\d+)?/) ?? [""])[0].replace(/,/g, ""));
    if (!Number.isFinite(eok)) return v;
    total += eok * 10000;
    total += parseMan(parts[1]);
    seen = true;
  } else {
    const m = s.match(/([\d,]+(?:\.\d+)?)\s*만/);
    if (m) {
      total += parseFloat(m[1].replace(/,/g, ""));
      seen = true;
    } else {
      const t = s.match(/([\d,]+)\s*천/);
      if (t && !/만/.test(s)) {
        total += parseInt(t[1].replace(/,/g, ""), 10) / 10;
        seen = total > 0;
      }
    }
  }
  if (!seen || !Number.isInteger(total) || total <= 0) return v;
  return `${total.toLocaleString()}만원`;
}

/** 값에 나온 숫자·문구가 근거 문구에 실제로 있는지 확인한다. */
function valueSupported(value: string, evidenceText: string): boolean {
  const ev = evidenceText.replace(/\s/g, "");
  if (/\d/.test(value)) {
    const groups = value.replace(/,/g, "").match(/\d{2,}/g) ?? [];
    if (groups.length > 0) {
      const evDigits = ev.replace(/[^\d]/g, "");
      return groups.every((g) => evDigits.includes(g));
    }
  }
  const v = value.replace(/\s/g, "");
  return v.length >= 2 && ev.includes(v);
}

function saneDate(value: string): boolean {
  const full = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    const mo = parseInt(full[2], 10);
    const da = parseInt(full[3], 10);
    return mo >= 1 && mo <= 12 && da >= 1 && da <= 31;
  }
  const md = value.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (md) {
    return parseInt(md[1], 10) >= 1 && parseInt(md[1], 10) <= 12 && parseInt(md[2], 10) >= 1 && parseInt(md[2], 10) <= 31;
  }
  return true;
}

export interface EvidenceMsg {
  author_type: string;
  text: string;
}

/**
 * 모델 출력 검증. 같은 방 근거·발화자 일치·원문 뒷받침이 맞을 때만 살린다.
 * confirmed는 모델이 줄 수 없다. 근거 부족분은 버린다(확정값 저장 금지).
 */
export function validateZiptalkOutput(data: unknown, evidence: Map<string, EvidenceMsg>): ValidatedAnalysis | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { conditions?: unknown; intervene?: unknown; bubble?: unknown };
  if (!Array.isArray(d.conditions)) return null;
  const conditions: ValidatedCondition[] = [];
  for (const c of d.conditions.slice(0, 10)) {
    if (!c || typeof c !== "object") continue;
    const r = c as { name?: unknown; value?: unknown; proposer?: unknown; status?: unknown; evidence_ids?: unknown };
    if (typeof r.name !== "string" || !r.name.trim() || r.name.trim().length > 50) continue;
    if (typeof r.value !== "string" || !r.value.trim() || r.value.length > 500) continue;
    if (r.proposer !== "human" && r.proposer !== "demo") continue;
    if (r.status !== "proposed" && r.status !== "unconfirmed") continue;
    if (!Array.isArray(r.evidence_ids) || r.evidence_ids.length === 0) continue;
    const msgs: EvidenceMsg[] = [];
    for (const id of r.evidence_ids) {
      if (typeof id !== "string") continue;
      const m = evidence.get(id);
      if (m) msgs.push(m);
    }
    if (msgs.length === 0) continue;
    const need = r.proposer === "human" ? "human" : "demo_agent";
    if (!msgs.some((m) => m.author_type === need)) continue;
    const joined = msgs.map((m) => m.text).join("\n");
    const normalized = normalizeValue(r.value);
    // 확정형 값(금액·날짜)은 원문 뒷받침 필수. 미확인 슬롯(값 비어 있음)은 질문 근거만으로 둔다.
    if (normalized && !valueSupported(normalized, joined) && !valueSupported(r.value.trim(), joined)) continue;
    if (!saneDate(normalized)) continue;
    conditions.push({ name: r.name.trim(), value: normalized, proposer: r.proposer, status: r.status, evidence: r.evidence_ids.filter((id): id is string => typeof id === "string" && evidence.has(id)) });
  }
  const bubble = typeof d.bubble === "string" && d.bubble.trim() && d.bubble.trim().length <= ZIPTALK_BUBBLE_LIMIT
    ? d.bubble.trim()
    : null;
  return { conditions, intervene: d.intervene === true && bubble !== null, bubble };
}

export interface ZiptalkInput {
  system: string;
  messages: ChatMessage[];
}

/** 같은 방 대화 + 매물 + 이전 조건으로 분석 입력 계약을 만든다. */
export function buildZiptalkInput(
  listingTitle: string,
  facts: Record<string, string>,
  prev: StoredCondition[],
  history: { id: string; author_type: string; author: string; text: string }[],
): ZiptalkInput {
  const factLines = Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`);
  const prevLines = prev.map((c) => `- ${c.name}=${c.value || "(미확인)"}(상태:${c.status},제안자:${c.proposer})`);
  const system = [
    "너는 중립 거래 정리 AI 집톡이다. 협상하지도 계약을 확정하지도 마. 반드시 JSON 한 덩어리만 출력한다.",
    `[매물] ${listingTitle}`,
    ...factLines,
    `[지금까지 조건]${prevLines.length > 0 ? "" : " 없음"}`,
    ...prevLines,
    "[규칙]",
    "- 조건 이름은 최초가·매수 희망가·매도 제안가·입주일·방문일·계약일·잔금일·옵션·수리 요청만 쓴다. 매물 정가는 최초가, 사람의 희망은 매수 희망가, AI의 제안은 매도 제안가로 나눈다.",
    "- 값·제안자(human|demo)·근거 메시지 ID가 분명할 때만 조건으로 낸다. 근거 IDs는 아래 대화의 [id]만 쓴다.",
    "- 값은 근거 문구에 실제로 나온 형태만 쓴다. 연도는 근거에 있을 때만 쓰고, 없으면 월·일만 쓴다. 금액은 만원·억원 단위 그대로 쓴다.",
    "- 근거가 부족하거나 모호하면 조건을 만들지 마.",
    "- 이미 정리된 내용을 또 안내하지 마. 새 제안·변경·모순·미확인 발견이 없으면 intervene=false, bubble=null.",
    "- 질문에 대한 답이 [지금까지 조건]에 있으면 bubble에 한 문장으로 답한다(최초가·희망가·제안가를 그대로 전달). 답할 때도 협상·확정·판단은 하지 마.",
    "- bubble에서 '확인이 필요합니다'라는 말을 반복하지 마.",
    "- 방문일 값은 'M월 D일 오전/오후 H시' 형태와 근거 ID를 함께 낸다. 시간이 없으면 날짜만 쓴다.",
    "- 상태는 proposed(제안됨) 또는 unconfirmed(미확인)만 쓴다. confirmed는 절대 쓰지 마.",
    "- 등급·판단·특약·법률 해석은 다루지 않는다.",
    "- 이전 조건과 모순되거나 바뀌었으면 그대로 기록하고 확정하지 마.",
    '출력: {"conditions":[{"name","value","proposer":"human|demo","status","evidence_ids":[]}],"intervene":bool,"bubble":string|null}',
    "- 개입은 새 제안·변경·모순·미확인 발견 때만 true. bubble은 한 문장 한국어.",
  ].join("\n");
  const messages: ChatMessage[] = history.slice(-15).map((m) => {
    const who = String(m.author_type) === "human" ? "사람" : String(m.author ?? "AI");
    const role = String(m.author_type) === "human" ? ("user" as const) : ("assistant" as const);
    return { role, content: `[${String(m.id)}] ${who}: ${String(m.text ?? "")}` };
  });
  return { system, messages };
}

/**
 * 매물 최초가를 조건으로 심는다. 근거는 AI 첫인사 등 매도자 메시지에 실제 나온 정가다.
 * 근거가 없으면 심지 않는다. 이미 있으면 손대지 않는다.
 */
async function seedListPrice(
  roomId: string,
  listing: { tradeType: string; salePrice: number; deposit: number },
  current: Map<string, StoredCondition>,
): Promise<void> {
  if (current.has("최초가")) return;
  const price = listing.tradeType === "매매" ? listing.salePrice : listing.deposit;
  if (!price || price <= 0) return;
  const digits = String(price);
  const rows = (await getDal().all("SELECT id, text FROM messages WHERE room_id = ? AND author_type = 'demo_agent' ORDER BY created_at ASC", [
    roomId,
  ])) as { id: string; text: string }[];
  const hit = rows.find((r) => String(r.text ?? "").replace(/[^\d]/g, "").includes(digits));
  if (!hit) return;
  await getDal().run(
    "INSERT INTO room_conditions (room_id,name,value,proposer,status,source_msg_ids,version,updated_at,confirmed_by,confirmed_at,confirmed_version) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id,name) DO NOTHING",
    [roomId, "최초가", priceText(price), "demo", "proposed", JSON.stringify([String(hit.id)]), 1, now(), "", "", 0],
  );
}

/**
 * 사용자가 특정 조건의 현재 버전을 직접 확인한다.
 * 인증된 사용자 ID로만 기록한다. AI·집톡이는 이 경로로 확인할 수 없다.
 * 값이 바뀌면 version이 올라가 이전 확인은 자동으로 무효가 된다.
 */
export async function confirmCondition(
  roomId: string,
  name: string,
  userId: string,
  expectedVersion?: number,
): Promise<{ ok: true; version: number } | { ok: false; status: number; error: string }> {
  const cur = await getDal().get("SELECT version FROM room_conditions WHERE room_id = ? AND name = ?", [roomId, name]);
  if (!cur) return { ok: false, status: 404, error: "조건 없음" };
  if (expectedVersion !== undefined && Number(cur.version ?? 0) !== expectedVersion) {
    return { ok: false, status: 409, error: `버전 불일치(현재 ${Number(cur.version ?? 0)})` };
  }
  await getDal().run(
    "UPDATE room_conditions SET confirmed_by = ?, confirmed_at = ?, confirmed_version = version WHERE room_id = ? AND name = ?",
    [userId, now(), roomId, name],
  );
  return { ok: true, version: Number(cur.version ?? 0) };
}

/**
 * 방문 제안이면 visits 행을 만든다. 시간까지 확정된 제안만 행으로 둔다.
 * 같은 방·같은 일시는 중복 생성하지 않는다. AI 시연 제안은 proposed_by로 구분한다.
 */
async function syncVisitProposal(roomId: string, trigger: TriggerMsg, proposer: "human" | "demo"): Promise<string | null> {
  const t = trigger.text;
  if (!t.includes("방문") && !t.includes("보러") && !t.includes("구경")) return null;
  const v = parseVisitProposal(t, trigger.created_at);
  if (!v || !v.time) return null;
  const dal = getDal();
  const dup = await dal.get(
    "SELECT id FROM visits WHERE room_id = ? AND visit_date = ? AND visit_time = ? AND status IN ('제안됨','수락됨')",
    [roomId, v.date, v.time],
  );
  if (dup) return String(dup.id);
  const room = await getRoom(roomId);
  const id = randomUUID();
  await dal.run(
    "INSERT INTO visits (id,listing_id,visit_date,visit_time,status,room_id,created_at,proposed_by,source_msg_ids,decided_by,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, room ? room.listing_id : "", v.date, v.time, "제안됨", roomId, now(), proposer, JSON.stringify([trigger.id]), "", ""],
  );
  return id;
}

export interface ZiptalkOk {
  ok: true;
  created: boolean;
  bubbleMessageId: string | null;
  applied: number;
  provider: DemoProvider;
  model: string;
}

export interface ZiptalkErr {
  ok: false;
  status: number;
  error: string;
  provider: DemoProvider;
  model: string;
}

async function currentConditions(roomId: string): Promise<Map<string, StoredCondition>> {
  const rows = await getDal().all("SELECT name, value, proposer, status, confirmed_by, confirmed_version FROM room_conditions WHERE room_id = ?", [roomId]);
  const map = new Map<string, StoredCondition>();
  for (const r of rows) {
    map.set(String(r.name), {
      name: String(r.name), value: String(r.value ?? ""), proposer: String(r.proposer ?? ""), status: String(r.status ?? ""),
      confirmedBy: String(r.confirmed_by ?? ""), confirmedVersion: Number(r.confirmed_version ?? 0),
    });
  }
  return map;
}

async function applyOutcome(roomId: string, outcome: AnalysisOutcome): Promise<{ bubbleMessageId: string | null; applied: number }> {
  let applied = 0;
  let bubbleMessageId: string | null = null;
  const dal = getDal();
  await dal.withTransaction(async (tx) => {
    for (const u of outcome.upserts) {
      const cur = await tx.get("SELECT value, proposer, status, version FROM room_conditions WHERE room_id = ? AND name = ?", [roomId, u.name]);
      if (!cur) {
        await tx.run(
          "INSERT INTO room_conditions (room_id,name,value,proposer,status,source_msg_ids,version,updated_at) VALUES (?,?,?,?,?,?,?,?)",
          [roomId, u.name, u.value, u.proposer, u.status, JSON.stringify(u.evidence), 1, now()],
        );
        applied++;
        continue;
      }
      if (String(cur.value ?? "") !== u.value || String(cur.status ?? "") !== u.status || String(cur.proposer ?? "") !== u.proposer) {
        await tx.run(
          "UPDATE room_conditions SET value = ?, proposer = ?, status = ?, source_msg_ids = ?, version = version + 1, updated_at = ? WHERE room_id = ? AND name = ?",
          [u.value, u.proposer, u.status, JSON.stringify(u.evidence), now(), roomId, u.name],
        );
        await tx.run(
          "INSERT INTO condition_history (id,room_id,name,old_value,new_value,source_msg_ids,created_at) VALUES (?,?,?,?,?,?,?)",
          [randomUUID(), roomId, u.name, String(cur.value ?? ""), u.value, JSON.stringify(u.evidence), now()],
        );
        applied++;
      }
    }
    // 같은 안내 반복 금지: 바뀐 조건이 없고 마지막 말풍선과 같은 문구면 조용히 넘긴다.
    let speak = outcome.intervene && !!outcome.bubble && (applied > 0 || outcome.upserts.length === 0);
    if (speak && outcome.upserts.length === 0 && outcome.bubble) {
      const last = await tx.get("SELECT text FROM messages WHERE room_id = ? AND author_type = 'assistant' ORDER BY created_at DESC LIMIT 1", [roomId]);
      if (last && String(last.text ?? "") === outcome.bubble) speak = false;
    }
    if (speak && outcome.bubble) {
      bubbleMessageId = randomUUID();
      const listingRow = await tx.get("SELECT listing_id FROM deal_rooms WHERE id = ?", [roomId]);
      await tx.run(
        "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [bubbleMessageId, listingRow ? String(listingRow.listing_id) : "", ZIPTALK_AUTHOR, "", `agent:${roomId}:ziptalk`, "assistant", roomId, outcome.bubble, now()],
      );
    }
  });
  return { bubbleMessageId, applied };
}

/**
 * 집톡이 분석 1건. 트리거는 사람·매도자 메시지만 된다(집톡이에는 반응하지 않는다).
 * 같은 (방, 트리거, ziptalk)는 DB 유일키로 1행만 둔다.
 */
export async function runZiptalk(opts: {
  roomId: string;
  triggerMessageId?: string;
  provider?: DemoProvider;
}): Promise<ZiptalkOk | ZiptalkErr> {
  const provider = opts.provider ?? resolveProvider();
  const model = provider === "meta" ? process.env.MODEL_MODEL ?? META_DEFAULT_MODEL : "ziptalk-v1";
  const room = await getRoom(opts.roomId);
  if (!room) return { ok: false, status: 404, error: "거래방 없음", provider, model };
  const dal = getDal();
  let trigger: TriggerMsg;
  if (opts.triggerMessageId) {
    const t = await dal.get("SELECT id, author_type, author, text, created_at FROM messages WHERE id = ? AND room_id = ?", [
      opts.triggerMessageId,
      opts.roomId,
    ]);
    if (!t) return { ok: false, status: 404, error: "트리거 메시지 없음", provider, model };
    if (String(t.author_type ?? "") !== "human" && String(t.author_type ?? "") !== "demo_agent") {
      return { ok: false, status: 409, error: "트리거 없음", provider, model };
    }
    trigger = { id: String(t.id), author_type: String(t.author_type), author: String(t.author ?? ""), text: String(t.text ?? ""), created_at: String(t.created_at ?? "") };
  } else {
    const last = await dal.get(
      "SELECT id, author_type, author, text, created_at FROM messages WHERE room_id = ? AND (author_type = 'human' OR author_type = 'demo_agent') ORDER BY created_at DESC LIMIT 1",
      [opts.roomId],
    );
    if (!last) return { ok: false, status: 409, error: "트리거 없음", provider, model };
    trigger = { id: String(last.id), author_type: String(last.author_type), author: String(last.author ?? ""), text: String(last.text ?? ""), created_at: String(last.created_at ?? "") };
  }
  const listing = await listingForDemo(room.listing_id);
  if (!listing) return { ok: false, status: 404, error: "매물 없음", provider, model };
  if (!isDemoListing(listing)) return { ok: false, status: 403, error: "시연방 전용", provider, model };
  let current = await currentConditions(opts.roomId);
  await seedListPrice(opts.roomId, listing, current);
  current = await currentConditions(opts.roomId);
  const runId = randomUUID();
  try {
    await dal.run(
      "INSERT INTO agent_runs (id,room_id,trigger_msg_id,agent_type,provider,model,status,latency_ms,error,usage_json,message_id,summary,created_at,prompt_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [runId, opts.roomId, trigger.id, "ziptalk", provider, model, "running", 0, "", "{}", "", "", now(), ZIPTALK_VERSION],
    );
  } catch {
    const existing = await dal.get("SELECT * FROM agent_runs WHERE room_id = ? AND trigger_msg_id = ? AND agent_type = ?", [
      opts.roomId,
      trigger.id,
      "ziptalk",
    ]);
    if (!existing) throw new Error("실행 등록 실패");
    const st = String(existing.status ?? "");
    if (st === "done") {
      return {
        ok: true, created: false,
        bubbleMessageId: String(existing.message_id ?? "") || null,
        applied: 0, provider: (String(existing.provider ?? "") === "meta" ? "meta" : "mock") as DemoProvider,
        model: String(existing.model ?? model),
      };
    }
    if (st === "failed") {
      await dal.run("UPDATE agent_runs SET status = 'running', error = '', latency_ms = ? WHERE id = ?", [0, String(existing.id)]);
      return executeZiptalk(String(existing.id), opts.roomId, trigger, listing, current, provider, model);
    }
    return { ok: false, status: 409, error: "처리 중", provider, model };
  }
  return executeZiptalk(runId, opts.roomId, trigger, listing, current, provider, model);
}

async function executeZiptalk(
  runId: string,
  roomId: string,
  trigger: TriggerMsg,
  listing: NonNullable<Awaited<ReturnType<typeof listingForDemo>>>,
  current: Map<string, StoredCondition>,
  provider: DemoProvider,
  model: string,
): Promise<ZiptalkOk | ZiptalkErr> {
  const started = Date.now();
  const fail = async (error: string, status: number, logExtra = ""): Promise<ZiptalkErr> => {
    await getDal().run("UPDATE agent_runs SET status = 'failed', error = ?, latency_ms = ? WHERE id = ?", [
      error,
      Date.now() - started,
      runId,
    ]);
    console.error(`[ziptalk] run failed room=${roomId} provider=${provider} error=${error}${logExtra ? ` detail=${logExtra}` : ""}`);
    return { ok: false, status, error, provider, model };
  };
  try {
    let outcome: AnalysisOutcome;
    let usageJson = "{}";
    if (provider === "meta") {
      const history = (await getDal().all(
        "SELECT id, author_type, author, text FROM messages WHERE room_id = ? ORDER BY created_at ASC",
        [roomId],
      )) as { id: string; author_type: string; author: string; text: string }[];
      const facts: Record<string, string> = {
        매물명: listing.title,
        가격: listing.tradeType === "매매" ? `${listing.salePrice.toLocaleString()}만원` : `${listing.deposit.toLocaleString()}만원`,
        입주일: listing.moveIn || "협의 가능",
        면적: `${listing.area}㎡`,
      };
      const prev = Array.from(current.values());
      const input = buildZiptalkInput(listing.title, facts, prev, history.slice(-15));
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
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(r.text);
      } catch {
        parsed = null;
      }
      const ev = new Map(history.map((m) => [String(m.id), { author_type: String(m.author_type ?? ""), text: String(m.text ?? "") }]));
      const validated = validateZiptalkOutput(parsed, ev);
      if (!validated) return fail("분석 결과 형식 오류.", 502, "bad_shape");
      outcome = { upserts: validated.conditions, intervene: validated.intervene, bubble: validated.bubble };
      usageJson = JSON.stringify({ inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
    } else {
      outcome = analyzeMock(trigger, current);
    }
    const applied = await applyOutcome(roomId, outcome);
    await syncVisitProposal(roomId, trigger, trigger.author_type === "human" ? "human" : "demo");
    await getDal().run(
      "UPDATE agent_runs SET status = 'done', latency_ms = ?, usage_json = ?, message_id = ?, summary = ? WHERE id = ?",
      [Date.now() - started, usageJson, applied.bubbleMessageId ?? "", (outcome.bubble ?? "").slice(0, 120), runId],
    );
    return { ok: true, created: applied.bubbleMessageId !== null, bubbleMessageId: applied.bubbleMessageId, applied: applied.applied, provider, model };
  } catch (e) {
    return fail(e instanceof Error ? `실행 오류: ${e.message}`.slice(0, 200) : "실행 오류.", 502, "exception");
  }
}
