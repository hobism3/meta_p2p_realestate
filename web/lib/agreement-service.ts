import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { isDemoListing, listingForDemo } from "./demo.ts";
import { getPersona, type NegotiationPolicy } from "./personas.ts";
import { parseManwonInt, parseVisitProposal } from "./visit-dates.ts";
import { extractPriceManwon } from "./ziptalk.ts";

/**
 * VS-4C 양측 합의. room_conditions·history는 그대로 두고 제안/승인을 별도로 둔다.
 * - 제안: proposed(동의 대기 중) → agreed(양측 동의) | refused(거절) | superseded(변경됨).
 * - 같은 조건의 새 제안이 오면 이전 열린 제안은 superseded. 과거 동의 재사용 금지.
 * - 시연방 AI 동의/거절은 페르소나·협상 정책 기반 서버 규칙으로 즉시 판정한다(AI 시연 명시).
 * - 사람 동의는 인증 토큰 신원으로만 기록한다(위조 금지).
 */

export const PROPOSABLE = [
  "매수 희망가",
  "매도 제안가",
  "계약금",
  "계약일",
  "잔금일",
  "인도일",
  "입주일",
  "방문일",
  "옵션",
  "수리 요청",
];

export type ProposalStatus = "proposed" | "agreed" | "refused" | "superseded";

export interface Proposal {
  id: string;
  room_id: string;
  name: string;
  value: string;
  version: number;
  source_msg_ids: string[];
  visit_id: string;
  status: ProposalStatus;
  card_msg_id: string;
  created_by: string;
  reason: string;
}

export interface Approval {
  actor_id: string;
  actor_type: string;
  decision: string;
}

function fmtRange(min: number, max: number): string {
  return `${min.toLocaleString()}~${max.toLocaleString()}만원`;
}

/** 시연방 AI의 동의/거절을 협상 정책으로 판정한다. 사람 방에서는 쓰지 않는다. */
export interface DemoContext {
  aiTexts: string[];
  aiDated: Array<{ text: string; at: string }>;
  visitDate: string;
  visitTime: string;
}

/** AI 발화 속 날짜 표현을 메시지 시각 기준 절대값으로 푼다. */
function resolvedBits(text: string, at: string): string[] {
  const bits: string[] = [];
  const v = parseVisitProposal(text, at);
  if (v) {
    const m = v.date.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      bits.push(`${Number(m[2])}월`, `${Number(m[3])}일`);
      if (v.time) {
        const h = Number(v.time.slice(0, 2)) % 12 === 0 ? 12 : Number(v.time.slice(0, 2)) % 12;
        bits.push(`${h}시`);
      }
    }
  }
  return bits;
}

/**
 * 시연방 AI의 동의/거절. 가격 외 조건을 무조건 수락하지 않는다.
 * AI 자신의 발언(createdBy demo)은 동의하고, 사람 제안은 AI가 같은 말을 했을 때만
 * 동의한다(매도자 발언·일정과 일치). 계약금은 서버 계산값이라 그대로 동의한다.
 */
export function evaluateDemoDecision(
  name: string,
  value: string,
  listPriceManwon: number,
  policy: NegotiationPolicy | undefined,
  createdBy: string,
  ctx: DemoContext = { aiTexts: [], aiDated: [], visitDate: "", visitTime: "" },
): { decision: "agree" | "refuse" | null; reason: string } {
  if (createdBy === "demo" && name !== "매수 희망가") return { decision: "agree", reason: "AI 시연 제안" };
  if (name === "매수 희망가") {
    const n = parseManwonInt(value);
    if (n === null) return { decision: "refuse", reason: "AI 시연: 금액을 알 수 없습니다." };
    if (policy?.kind === "ranged") {
      if (n >= policy.min && n <= policy.max) return { decision: "agree", reason: "AI 시연 동의" };
      return { decision: "refuse", reason: `AI 시연 거절: 협의 범위(${fmtRange(policy.min, policy.max)})를 벗어났습니다.` };
    }
    if (policy?.kind === "none") {
      if (n >= listPriceManwon && listPriceManwon > 0) return { decision: "agree", reason: "AI 시연 동의" };
      return { decision: "refuse", reason: "AI 시연 거절: 협의 불가 매물입니다." };
    }
    // undecided: 정책만으로 동의하지 않는다. AI가 같은 값에 수락 발언을 했을 때만 동의한다.
    if (aiAcceptsPrice(ctx.aiDated, n)) return { decision: "agree", reason: "AI 시연 동의" };
    return { decision: null, reason: "" };
  }
  if (name === "매도 제안가") return { decision: "agree", reason: "AI 시연 동의" };
  if (name === "계약금") return { decision: "agree", reason: "AI 시연 동의" };
  const joined = ctx.aiTexts.join("\n");
  // 증거가 없으면 대기(null)한다. 섣불리 동의하지도 거절하지도 않는다.
  // AI가 다른 값을 말했을 때만 거절한다.
  const resolved = (ctx.aiDated ?? []).flatMap((d) => resolvedBits(d.text, d.at));
  const known = `${joined}\n${resolved.join("\n")}`;
  if (name === "방문일") {
    const m = ctx.visitDate.match(/(\d{4})-(\d{2})-(\d{2})/);
    const hm = ctx.visitTime.match(/(\d{2}):(\d{2})/);
    if (!m || !hm) return { decision: null, reason: "" };
    const h12 = Number(hm[1]) % 12 === 0 ? 12 : Number(hm[1]) % 12;
    const dayHit = known.includes(`${Number(m[2])}월`) && known.includes(`${Number(m[3])}일`);
    const timeHit = known.includes(`${h12}시`);
    if (dayHit && timeHit) return { decision: "agree", reason: "AI 시연 동의" };
    if (conflictingVisit(joined, Number(m[2]), Number(m[3]))) {
      return { decision: "refuse", reason: "AI 시연 거절: 다른 일정을 제안했습니다." };
    }
    return { decision: null, reason: "" };
  }
  const months: string[] = [];
  const days: string[] = [];
  let mm: RegExpExecArray | null;
  const mre = /(\d{1,2})월/g;
  while ((mm = mre.exec(value)) !== null) months.push(`${Number(mm[1])}월`);
  const dre = /(\d{1,2})일/g;
  while ((mm = dre.exec(value)) !== null) days.push(`${Number(mm[1])}일`);
  if (months.length > 0 || days.length > 0) {
    if ([...months, ...days].every((bit) => known.includes(bit))) return { decision: "agree", reason: "AI 시연 동의" };
    return { decision: null, reason: "" };
  }
  if (value.replace(/\s/g, "") && joined.replace(/\s/g, "").includes(value.replace(/\s/g, ""))) {
    return { decision: "agree", reason: "AI 시연 동의" };
  }
  return { decision: null, reason: "" };
}

const ACCEPT_CUES = /(가능합니다|좋습니다|그러시죠|알겠습니다)/;

/** AI가 같은 금액에 수락 발언을 했는지 확인한다. 근거 없으면 대기한다. */
export function aiAcceptsPrice(aiDated: Array<{ text: string; at: string }>, manwon: number): boolean {
  return (aiDated ?? []).some((d) => {
    if (!ACCEPT_CUES.test(d.text)) return false;
    const p = extractPriceManwon(d.text);
    return p === manwon;
  });
}

/** 방문 맥락 AI 발화에서 제안 날짜와 다른 (월, 일)이 나오면 true. */
export function conflictingVisit(aiJoined: string, month: number, day: number): boolean {
  const visitCtx = /(방문|보러|구경|보실)/.test(aiJoined);
  if (!visitCtx) return false;
  const re = /(\d{1,2})월\s*(\d{1,2})일/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(aiJoined)) !== null) {
    if (Number(m[1]) !== month || Number(m[2]) !== day) return true;
  }
  return false;
}

async function roomSides(roomId: string, demo: boolean): Promise<Array<{ key: string; label: string }>> {
  if (demo) {
    return [
      { key: "human", label: "매수자" },
      { key: "demo", label: "AI 매도자(시연)" },
    ];
  }
  const members = (await getDal().all("SELECT user_id, role FROM room_members WHERE room_id = ?", [roomId])) as {
    user_id: string;
    role: string;
  }[];
  return members.slice(0, 8).map((m) => ({
    key: `human:${String(m.user_id)}`,
    label: String(m.role) === "landlord" ? "매도자" : String(m.role) === "seller" ? "매도자" : "매수자",
  }));
}

function sideOf(actorType: string, actorId: string, demo: boolean): string {
  if (actorType === "demo") return "demo";
  return demo ? "human" : `human:${actorId}`;
}

/**
 * 양측 동의 판정. 시연방=사람 1명+AI, 실제방=매수(tenant)역할 1명+매도(landlord)역할 1명.
 * 임의의 두 사용자 동의만으로 확정되지 않는다. roles는 actor_id→room_members.role이다.
 */
export function isAgreed(approvals: Approval[], demo: boolean, roles: Record<string, string> = {}): boolean {
  const decisions = approvals.map((a) => a.decision);
  if (decisions.includes("refuse")) return false;
  const agrees = approvals.filter((a) => a.decision === "agree");
  if (demo) {
    return agrees.some((a) => a.actor_type === "human") && agrees.some((a) => a.actor_type === "demo");
  }
  const sideOf = (a: Approval): string => {
    const r = roles[a.actor_id] ?? "";
    if (r === "landlord" || r === "seller") return "seller";
    if (r === "tenant" || r === "buyer") return "buyer";
    return "";
  };
  const sides = new Set(agrees.filter((a) => a.actor_type === "human").map(sideOf));
  return sides.has("buyer") && sides.has("seller");
}

export async function getProposals(
  roomId: string,
): Promise<{ proposals: Proposal[]; approvals: Record<string, Approval[]>; sides: Array<{ key: string; label: string }>; demo: boolean }> {
  const dal = getDal();
  const room = (await dal.get("SELECT listing_id FROM deal_rooms WHERE id = ?", [roomId])) as
    | { listing_id: string }
    | undefined;
  const listing = room ? await listingForDemo(String(room.listing_id ?? "")) : null;
  const demo = !!listing && isDemoListing(listing);
  const rows = (await dal.all("SELECT * FROM room_proposals WHERE room_id = ? ORDER BY created_at ASC", [roomId])) as Record<
    string,
    string | number
  >[];
  const proposals: Proposal[] = rows.map((r) => ({
    id: String(r.id),
    room_id: String(r.room_id),
    name: String(r.name),
    value: String(r.value ?? ""),
    version: Number(r.version ?? 1),
    source_msg_ids: (() => {
      try {
        const v = JSON.parse(String(r.source_msg_ids ?? "[]")) as unknown;
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    })(),
    visit_id: String(r.visit_id ?? ""),
    status: String(r.status ?? "proposed") as ProposalStatus,
    card_msg_id: String(r.card_msg_id ?? ""),
    created_by: String(r.created_by ?? ""),
    reason: String(r.reason ?? ""),
  }));
  const approvals: Record<string, Approval[]> = {};
  for (const p of proposals) {
    const ars = (await dal.all("SELECT actor_id, actor_type, decision FROM proposal_approvals WHERE proposal_id = ?", [
      p.id,
    ])) as { actor_id: string; actor_type: string; decision: string }[];
    approvals[p.id] = ars.map((a) => ({ actor_id: String(a.actor_id), actor_type: String(a.actor_type), decision: String(a.decision) }));
  }
  return { proposals, approvals, sides: await roomSides(roomId, demo), demo };
}

export interface CreatedProposal extends Proposal {
  demoDecision: "agree" | "refuse" | null;
  isNew: boolean;
}

/**
 * 집톡이 분석 확정분에서 합의 카드를 만든다. 구체 값이 있는 협의 조건만 대상이다.
 * 방문일은 시간까지 있어야 카드가 된다(정오·자정 단독 등 모호하면 묻기만 한다).
 */
export interface ProposalItem {
  name: string;
  value: string;
  evidence: string[];
  visitId?: string;
  refISO?: string;
  createdBy: "human" | "demo";
}

/**
 * 최종 거래가격: 매수 희망가와 매도 제안가가 같은 값·버전으로 모두 합의됐을 때만
 * 하나의 거래가격으로 본다. 따로 합의된 희망·역제안은 거래가격이 아니다.
 */
export function agreedDealPrice(
  proposals: Proposal[],
  approvals: Record<string, Approval[]>,
  demo: boolean,
  roles: Record<string, string> = {},
): { value: string } | null {
  const agreedOf = (name: string): Proposal[] =>
    proposals.filter((p) => p.name === name && p.status === "agreed");
  for (const w of agreedOf("매수 희망가")) {
    const match = agreedOf("매도 제안가").find((o) => o.value === w.value);
    if (match && isAgreed(approvals[w.id] ?? [], demo, roles) && isAgreed(approvals[match.id] ?? [], demo, roles)) {
      return { value: w.value };
    }
  }
  return null;
}

export async function createProposals(
  roomId: string,
  items: Array<ProposalItem>,
): Promise<CreatedProposal[]> {
  const dal = getDal();
  const room = (await dal.get("SELECT listing_id FROM deal_rooms WHERE id = ?", [roomId])) as
    | { listing_id: string }
    | undefined;
  if (!room) return [];
  const listing = await listingForDemo(String(room.listing_id ?? ""));
  const demo = !!listing && isDemoListing(listing);
  const persona = listing ? getPersona(listing.id) : undefined;
  const listPrice = listing ? (listing.tradeType === "매매" ? listing.salePrice : listing.deposit) : 0;
  const aiDated = demo
    ? (
        (await dal.all("SELECT text, created_at FROM messages WHERE room_id = ? AND author_type = 'demo_agent' ORDER BY created_at DESC LIMIT 10", [
          roomId,
        ])) as { text: string; created_at: string }[]
      ).map((r) => ({ text: String(r.text ?? ""), at: String(r.created_at ?? "") }))
    : [];
  const aiTexts = aiDated.map((d) => d.text);
  return dal.withTransaction(async (tx) => {
  const out: CreatedProposal[] = [];
  for (const it of items) {
    if (!PROPOSABLE.includes(it.name) || !it.value) continue;
    // 방문일은 시간이 확정될 때만 카드가 된다. 정오·자정 단독 등 모호하면 묻기만 한다.
    if (it.name === "방문일" && !parseVisitProposal(it.value, it.refISO || now())?.time) continue;
    const dup = (await tx.get(
      "SELECT id, version, status FROM room_proposals WHERE room_id = ? AND name = ? AND value = ? AND status = 'proposed'",
      [roomId, it.name, it.value],
    )) as { id: string; version: number; status: string } | undefined;
    if (dup) {
      out.push({
        id: String(dup.id),
        room_id: roomId,
        name: it.name,
        value: it.value,
        version: Number(dup.version ?? 1),
        source_msg_ids: it.evidence,
        visit_id: "",
        status: "proposed",
        card_msg_id: "",
        created_by: it.createdBy,
        reason: "",
        demoDecision: null,
        isNew: false,
      });
      continue;
    }
    const mv = (await tx.get("SELECT MAX(version) AS m FROM room_proposals WHERE room_id = ? AND name = ?", [
      roomId,
      it.name,
    ])) as { m: number | null } | undefined;
    const version = Number(mv?.m ?? 0) + 1;
    // 방문일은 값과 정확히 일치하는 visits 행만 연결한다. 최신 행을 임의로 쓰지 않는다.
    let visitId = it.visitId ?? "";
    let visitDate = "";
    let visitTime = "";
    if (!visitId && it.name === "방문일") {
      const parsed = parseVisitProposal(it.value, it.refISO || now());
      if (parsed && parsed.time) {
        const hit = (await tx.get(
          "SELECT id, visit_date, visit_time FROM visits WHERE room_id = ? AND visit_date = ? AND visit_time = ? AND status IN ('제안됨','수락됨')",
          [roomId, parsed.date, parsed.time],
        )) as { id: string; visit_date: string; visit_time: string } | undefined;
        if (hit) {
          visitId = String(hit.id);
          visitDate = String(hit.visit_date ?? "");
          visitTime = String(hit.visit_time ?? "");
        }
      }
    } else if (visitId) {
      const vr = (await tx.get("SELECT visit_date, visit_time FROM visits WHERE id = ?", [visitId])) as
        | { visit_date: string; visit_time: string }
        | undefined;
      if (vr) {
        visitDate = String(vr.visit_date ?? "");
        visitTime = String(vr.visit_time ?? "");
      }
    }
    const id = randomUUID();
    const stamp = now();
    await tx.run(
      "INSERT INTO room_proposals (id,room_id,name,value,version,source_msg_ids,visit_id,status,created_by,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, roomId, it.name, it.value, version, JSON.stringify(it.evidence), visitId, "proposed", it.createdBy, "", stamp, stamp],
    );
    await tx.run("UPDATE room_proposals SET status = 'superseded', updated_at = ? WHERE room_id = ? AND name = ? AND id <> ? AND status = 'proposed'", [
      stamp,
      roomId,
      it.name,
      id,
    ]);
    let demoDecision: "agree" | "refuse" | null = null;
    let reason = "";
    if (demo) {
      const ev = evaluateDemoDecision(it.name, it.value, Number(listPrice ?? 0), persona?.policy, it.createdBy, {
        aiTexts,
        aiDated,
        visitDate,
        visitTime,
      });
      demoDecision = ev.decision;
      if (ev.decision === "agree") {
        await tx.run(
          "INSERT INTO proposal_approvals (proposal_id,actor_id,actor_type,decision,created_at) VALUES (?,?,?,?,?)",
          [id, `demo:${roomId}`, "demo", "agree", stamp],
        );
      } else if (ev.decision === "refuse") {
        reason = ev.reason;
        await tx.run("UPDATE room_proposals SET status = 'refused', reason = ?, updated_at = ? WHERE id = ?", [
          reason,
          stamp,
          id,
        ]);
      }
    }
    out.push({
      id,
      room_id: roomId,
      name: it.name,
      value: it.value,
      version,
      source_msg_ids: it.evidence,
      visit_id: visitId,
      status: demoDecision === "refuse" ? "refused" : "proposed",
      card_msg_id: "",
      created_by: it.createdBy,
      reason,
      demoDecision,
      isNew: true,
    });
  }
  return out;
  });
}

/** 사람 동의/거절. 버전이 어긋나거나 이미 처리됐으면 409, 같은 주체 중복도 409. */
export async function decideProposal(
  roomId: string,
  proposalId: string,
  actorId: string,
  decision: "agree" | "refuse",
  expectedVersion?: number,
): Promise<{ ok: true; status: ProposalStatus; version: number } | { ok: false; status: number; error: string }> {
  const dal = getDal();
  const p = (await dal.get("SELECT * FROM room_proposals WHERE id = ? AND room_id = ?", [proposalId, roomId])) as Record<
    string,
    string | number
  > | undefined;
  if (!p) return { ok: false, status: 404, error: "제안 없음" };
  if (String(p.status ?? "") !== "proposed") return { ok: false, status: 409, error: "이미 처리된 제안" };
  if (expectedVersion !== undefined && Number(p.version ?? 0) !== expectedVersion) {
    return { ok: false, status: 409, error: `버전 불일치(현재 ${Number(p.version ?? 0)})` };
  }
  const room = (await dal.get("SELECT listing_id FROM deal_rooms WHERE id = ?", [roomId])) as { listing_id: string } | undefined;
  const listing = room ? await listingForDemo(String(room.listing_id ?? "")) : null;
  const demo = !!listing && isDemoListing(listing);
  const memberRows = (await dal.all("SELECT user_id, role FROM room_members WHERE room_id = ?", [roomId])) as {
    user_id: string;
    role: string;
  }[];
  const roles: Record<string, string> = {};
  for (const m of memberRows) roles[String(m.user_id)] = String(m.role ?? "");
  const stamp = now();
  // 승인·제안·방문 갱신은 한 트랜잭션으로 묶는다. 동시 동의도 복합키가 막는다.
  try {
    return await dal.withTransaction(async (tx) => {
      const dup = await tx.get("SELECT decision FROM proposal_approvals WHERE proposal_id = ? AND actor_id = ?", [
        proposalId,
        actorId,
      ]);
      if (dup) return { ok: false as const, status: 409 as const, error: "이미 응답한 제안" };
      const cur = (await tx.get("SELECT status, version FROM room_proposals WHERE id = ?", [proposalId])) as
        | { status: string; version: number }
        | undefined;
      if (!cur || String(cur.status ?? "") !== "proposed") return { ok: false as const, status: 409 as const, error: "이미 처리된 제안" };
      if (expectedVersion !== undefined && Number(cur.version ?? 0) !== expectedVersion) {
        return { ok: false as const, status: 409 as const, error: `버전 불일치(현재 ${Number(cur.version ?? 0)})` };
      }
      await tx.run("INSERT INTO proposal_approvals (proposal_id,actor_id,actor_type,decision,created_at) VALUES (?,?,?,?,?)", [
        proposalId,
        actorId,
        "human",
        decision,
        stamp,
      ]);
      const ars = (await tx.all("SELECT actor_id, actor_type, decision FROM proposal_approvals WHERE proposal_id = ?", [
        proposalId,
      ])) as { actor_id: string; actor_type: string; decision: string }[];
      const approvals: Approval[] = ars.map((a) => ({
        actor_id: String(a.actor_id),
        actor_type: String(a.actor_type),
        decision: String(a.decision),
      }));
      let status: ProposalStatus = "proposed";
      if (approvals.some((a) => a.decision === "refuse")) status = "refused";
      else if (isAgreed(approvals, demo, roles)) status = "agreed";
      await tx.run("UPDATE room_proposals SET status = ?, updated_at = ? WHERE id = ?", [status, stamp, proposalId]);
      const visitId = String(p.visit_id ?? "");
      if (visitId && (status === "agreed" || status === "refused")) {
        const v = (await tx.get("SELECT status FROM visits WHERE id = ? AND room_id = ?", [visitId, roomId])) as
          | { status: string }
          | undefined;
        if (v && String(v.status) === "제안됨") {
          await tx.run("UPDATE visits SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", [
            status === "agreed" ? "수락됨" : "거절됨",
            `agreement:${proposalId}`,
            stamp,
            visitId,
          ]);
        }
      }
      return { ok: true as const, status, version: Number(p.version ?? 1) };
    });
  } catch (e) {
    if (/unique|23505|constraint/i.test(e instanceof Error ? e.message : "")) {
      return { ok: false, status: 409, error: "이미 응답한 제안" };
    }
    throw e;
  }
}

export function bubbleFor(created: CreatedProposal[]): string | null {
  if (created.length === 0) return null;
  const c = created[0];
  const short = c.name.replace(/일$/, "");
  let s = `${c.name}: ${c.value} — ${short} 확인 카드를 만들었어요. 양측이 모두 동의해야 확정됩니다.`;
  if (c.demoDecision === "refuse" && c.reason) s += ` AI 매도자(시연)가 거절했어요(${c.reason}).`;
  if (created.length > 1) s += ` 외 ${created.length - 1}건은 거래 현황에서 확인해 주세요.`;
  return s;
}
