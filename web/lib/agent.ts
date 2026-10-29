/**
 * 시연용 AI 거래 상대방 mock provider.
 * 합성 시나리오의 facts/negotiable만 사용한다. 없는 사실은 만들지 않는다.
 * 실제 Muse 호출과 구분되도록 provider는 항상 "mock"이다.
 */

import { parseVisitProposal } from "./visit-dates.ts";
import { parseRentFields } from "./rent.ts";

export type AgentSide = "seller" | "buyer";

/**
 * AI 답에 새 제안·날짜 단서가 있는지 본다. 있으면 AI 메시지를, 없으면 사람 메시지를
 * 집톡이 트리거로 쓴다. 답변이 끝난 질문을 집톡이가 놓치지 않게 한다.
 */
export function hasNewProposalCue(text: string): boolean {
  return /(제안|깎|네고|합시다|어때|안돼|조율|협의|가능합니다|방문|보러|계약|잔금|인도|입주|이사|내일|모레|다음달|다다음달|이번달|내년)/.test(text);
}

export interface Scenario {
  persona: string;
  side: AgentSide;
  facts: Record<string, string>;
  negotiable: Record<string, { min: number; max: number; unit: string }>;
  lease?: { tradeType: "전세" | "월세"; policy: "none" | "undecided" | "ranged"; min: number; max: number; deposit: number; rent: number };
}

export interface AgentReply {
  text: string;
  proposal: { field: string; value: number; unit: string; confirmed: false } | null;
  needsHuman: boolean;
}

export const MOCK_PROMPT_VERSION = "mock-v1";

function findNumber(text: string): number | null {
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(억|만원|만)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === "억") return Math.round(n * 10000);
  return n;
}

function mentions(text: string, ...keys: string[]): boolean {
  return keys.some((k) => text.includes(k));
}

/**
 * 사람 메시지 1건에 대한 AI 응답 초안 1건. 결정적 규칙 기반이라 테스트 가능하다.
 * 중요 조건은 자동 확정하지 않는다(confirmed는 항상 false, 범위 밖은 needsHuman).
 */
export function draftReply(
  scenario: Scenario,
  humanText: string,
  opts?: { refISO?: string; leaseBaseline?: { deposit: number | null; monthlyRent: number | null } },
): AgentReply {
  const t = humanText.trim();
  if (mentions(t, "등급", "판결", "소송", "법률", "특약")) {
    return {
      text: "그 부분은 제가 답할 수 없습니다.",
      proposal: null,
      needsHuman: true,
    };
  }
  if (scenario.lease) {
    let f = parseRentFields(t);
    if (f.deposit === null && f.monthlyRent === null && scenario.lease.tradeType === "전세" && /(제안|깎|네고|합시다|어때|협의)/.test(t)) {
      const bare = findNumber(t);
      if (bare !== null) f = { deposit: bare, monthlyRent: null };
    }
    if (f.deposit !== null || f.monthlyRent !== null) {
      const L = scenario.lease;
      // 매물 정가가 아니라 현재 협의 중인 값을 기준으로 받는다(협상 기억).
      const dep = f.deposit ?? opts?.leaseBaseline?.deposit ?? L.deposit;
      const rent = L.tradeType === "월세" ? (f.monthlyRent ?? opts?.leaseBaseline?.monthlyRent ?? L.rent) : 0;
      let ok = L.policy === "undecided";
      if (L.policy === "ranged") ok = dep >= L.min && dep <= L.max;
      if (L.policy === "none") ok = dep >= L.deposit && rent >= L.rent;
      if (ok) {
        return {
          text: L.tradeType === "월세"
            ? `시연용으로 보증금 ${dep.toLocaleString()}만원에 월세 ${rent.toLocaleString()}만원에 가능합니다. (미확정, 사람 확인 필요)`
            : `시연용으로 전세보증금 ${dep.toLocaleString()}만원에 가능합니다. (미확정, 사람 확인 필요)`,
          proposal: null,
          needsHuman: false,
        };
      }
      return { text: "그 금액은 어렵습니다.", proposal: null, needsHuman: true };
    }
  }
  if (/(방문|보러|구경)/.test(t)) {
    const v = opts?.refISO ? parseVisitProposal(t, opts.refISO) : null;
    if (v && v.time) {
      return {
        text: `시연용으로 ${v.display}에 가능합니다. (미확정, 사람 확인 필요)`,
        proposal: null,
        needsHuman: false,
      };
    }
  }
  if (mentions(t, "얼마", "가격", "보증금", "월세", "매매가")) {
    const field = mentions(t, "월세") ? "월세" : mentions(t, "보증금") ? "보증금" : "가격";
    const fact = scenario.facts[field] ?? scenario.facts["가격"];
    if (fact) return { text: `${field}은 ${fact}입니다.`, proposal: null, needsHuman: false };
  }
  if (mentions(t, "입주", "언제", "이사")) {
    const fact = scenario.facts["입주일"];
    if (fact) return { text: `입주는 ${fact} 가능합니다.`, proposal: null, needsHuman: false };
  }
  // 제안 판정을 상태 조회보다 먼저 둔다. "하자고"의 "하자"가 결함 키워드에 걸리기 때문이다.
  const offered = findNumber(t);
  if (offered !== null && mentions(t, "제안", "깎", "네고", "하자", "합시다", "어때")) {
    for (const [field, range] of Object.entries(scenario.negotiable)) {
      if (offered >= range.min && offered <= range.max) {
        return {
          text: `시연용으로 ${field} ${offered}${range.unit}에 가능합니다. (미확정, 사람 확인 필요)`,
          proposal: { field, value: offered, unit: range.unit, confirmed: false },
          needsHuman: false,
        };
      }
    }
    return {
      text: "그 금액은 어렵습니다.",
      proposal: null,
      needsHuman: true,
    };
  }
  if (mentions(t, "수리", "상태", "옵션", "하자")) {
    const fact = scenario.facts["상태"];
    if (fact) return { text: `집 상태는 ${fact}입니다.`, proposal: null, needsHuman: false };
  }
  const factHit = Object.entries(scenario.facts).find(([k]) => t.includes(k));
  if (factHit) return { text: `${factHit[0]}은 ${factHit[1]}입니다.`, proposal: null, needsHuman: false };
  return {
    text: "시나리오에 없어 답하기 어렵습니다.",
    proposal: null,
    needsHuman: true,
  };
}

export function disclosureLabel(side: AgentSide): string {
  return side === "seller" ? "AI 매도자(시연)" : "AI 매수자(시연)";
}
