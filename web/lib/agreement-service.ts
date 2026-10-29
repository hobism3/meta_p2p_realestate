import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { isDemoListing, listingForDemo } from "./demo.ts";
import { getPersona, type NegotiationPolicy } from "./personas.ts";
import { parseManwonInt } from "./visit-dates.ts";

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
export function evaluateDemoDecision(
  name: string,
  value: string,
  listPriceManwon: number,
  policy: NegotiationPolicy | undefined,
  createdBy: string,
): { decision: "agree" | "refuse"; reason: string } {
  if (name === "매도 제안가" || createdBy === "demo") return { decision: "agree", reason: "AI 시연 제안" };
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
    return { decision: "agree", reason: "AI 시연 동의" };
  }
  return { decision: "agree", reason: "AI 시연 동의" };
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

/** 양측 동의 판정. 시연방=사람 1명+AI, 실제방=서로 다른 사람 2명 이상. */
export function isAgreed(approvals: Approval[], demo: boolean): boolean {
  const agrees = approvals.filter((a) => a.decision === "agree");
  if (agrees.some((a) => a.decision === "refuse")) return false;
  if (demo) {
    return agrees.some((a) => a.actor_type === "human") && agrees.some((a) => a.actor_type === "demo");
  }
  const humans = new Set(agrees.filter((a) => a.actor_type === "human").map((a) => a.actor_id));
  return humans.size >= 2;
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
}

/**
 * 집톡이 분석 확정분에서 합의 카드를 만든다. 구체 값이 있는 협의 조건만 대상이다.
 * 방문일은 시간까지 있어야 카드가 된다(정오·자정 단독 등 모호하면 묻기만 한다).
 */
export async function createProposals(
  roomId: string,
  items: Array<{ name: string; value: string; evidence: string[] }>,
  createdBy: "human" | "demo",
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
  const out: CreatedProposal[] = [];
  for (const it of items) {
    if (!PROPOSABLE.includes(it.name) || !it.value) continue;
    if (it.name === "방문일" && !/(오전|오후|시)/.test(it.value)) continue;
    const dup = (await dal.get(
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
        created_by: createdBy,
        reason: "",
        demoDecision: null,
      });
      continue;
    }
    const mv = (await dal.get("SELECT MAX(version) AS m FROM room_proposals WHERE room_id = ? AND name = ?", [
      roomId,
      it.name,
    ])) as { m: number | null } | undefined;
    const version = Number(mv?.m ?? 0) + 1;
    let visitId = "";
    if (it.name === "방문일") {
      const v = (await dal.get(
        "SELECT id FROM visits WHERE room_id = ? AND status IN ('제안됨','수락됨') ORDER BY created_at DESC LIMIT 1",
        [roomId],
      )) as { id: string } | undefined;
      if (v) visitId = String(v.id);
    }
    const id = randomUUID();
    const stamp = now();
    await dal.run(
      "INSERT INTO room_proposals (id,room_id,name,value,version,source_msg_ids,visit_id,status,created_by,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, roomId, it.name, it.value, version, JSON.stringify(it.evidence), visitId, "proposed", createdBy, "", stamp, stamp],
    );
    await dal.run("UPDATE room_proposals SET status = 'superseded', updated_at = ? WHERE room_id = ? AND name = ? AND id <> ? AND status = 'proposed'", [
      stamp,
      roomId,
      it.name,
      id,
    ]);
    let demoDecision: "agree" | "refuse" | null = null;
    if (demo) {
      const ev = evaluateDemoDecision(it.name, it.value, Number(listPrice ?? 0), persona?.policy, createdBy);
      demoDecision = ev.decision;
      if (ev.decision === "agree") {
        await dal.run(
          "INSERT INTO proposal_approvals (proposal_id,actor_id,actor_type,decision,created_at) VALUES (?,?,?,?,?)",
          [id, `demo:${roomId}`, "demo", "agree", stamp],
        );
      } else {
        await dal.run("UPDATE room_proposals SET status = 'refused', reason = ?, updated_at = ? WHERE id = ?", [
          ev.reason,
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
      created_by: createdBy,
      reason: demoDecision === "refuse" ? (await reasonOf(id)) : "",
      demoDecision,
    });
  }
  return out;
}

async function reasonOf(id: string): Promise<string> {
  const r = (await getDal().get("SELECT reason FROM room_proposals WHERE id = ?", [id])) as { reason: string } | undefined;
  return String(r?.reason ?? "");
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
  const dup = await dal.get("SELECT decision FROM proposal_approvals WHERE proposal_id = ? AND actor_id = ?", [proposalId, actorId]);
  if (dup) return { ok: false, status: 409, error: "이미 응답한 제안" };
  const stamp = now();
  await dal.run("INSERT INTO proposal_approvals (proposal_id,actor_id,actor_type,decision,created_at) VALUES (?,?,?,?,?)", [
    proposalId,
    actorId,
    "human",
    decision,
    stamp,
  ]);
  const ars = (await dal.all("SELECT actor_id, actor_type, decision FROM proposal_approvals WHERE proposal_id = ?", [proposalId])) as {
    actor_id: string;
    actor_type: string;
    decision: string;
  }[];
  const approvals: Approval[] = ars.map((a) => ({ actor_id: String(a.actor_id), actor_type: String(a.actor_type), decision: String(a.decision) }));
  const room = (await dal.get("SELECT listing_id FROM deal_rooms WHERE id = ?", [roomId])) as { listing_id: string } | undefined;
  const listing = room ? await listingForDemo(String(room.listing_id ?? "")) : null;
  const demo = !!listing && isDemoListing(listing);
  let status: ProposalStatus = "proposed";
  if (approvals.some((a) => a.decision === "refuse")) status = "refused";
  else if (isAgreed(approvals, demo)) status = "agreed";
  await dal.run("UPDATE room_proposals SET status = ?, updated_at = ? WHERE id = ?", [status, stamp, proposalId]);
  const visitId = String(p.visit_id ?? "");
  if (visitId && (status === "agreed" || status === "refused")) {
    const v = (await dal.get("SELECT status FROM visits WHERE id = ? AND room_id = ?", [visitId, roomId])) as
      | { status: string }
      | undefined;
    if (v && String(v.status) === "제안됨") {
      await dal.run("UPDATE visits SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", [
        status === "agreed" ? "수락됨" : "거절됨",
        `agreement:${proposalId}`,
        stamp,
        visitId,
      ]);
    }
  }
  return { ok: true, status, version: Number(p.version ?? 1) };
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
