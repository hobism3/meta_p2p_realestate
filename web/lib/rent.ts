/**
 * VS-4C.3 거래유형별 합의 도메인. 순수 함수(네트워크·DB 없음).
 * - 매매: 최종 매매가(단일 금액). 전세: 최종 전세보증금(단일 금액).
 * - 월세: {보증금, 월세} 원자적 묶음. 둘 중 하나만 동의·확정 금지.
 * - 희망가·역제안은 협상 이력 전용이다. 카드·동의 버튼을 만들지 않는다.
 */
import type { TradeType } from "./listings.ts";

/** 유형별 최종 협의 후보(합의 카드 대상) 이름. */
export const FINAL_PRICE_NAME: Record<TradeType, string> = {
  "매매": "최종 매매가",
  "전세": "최종 전세보증금",
  "월세": "월세 조건",
};

/** 유형별 협상 이력(카드 금지) 이름: 임차인·매수자 측이 말한 희망 조건. */
export function wantHistoryName(tradeType: TradeType): string {
  if (tradeType === "매매") return "매수 희망가";
  return "임차 희망 조건";
}

/** 유형별 협상 이력(카드 금지) 이름: AI·상대 측이 말한 제안 조건. */
export function offerHistoryName(tradeType: TradeType): string {
  if (tradeType === "매매") return "매도 제안가";
  return "임대 제안 조건";
}

/** 카드 생성 가능 이름. 희망·역제안·최초가는 여기 없으며 카드가 되지 않는다. */
export const FINALIZABLE = [
  "최종 매매가",
  "최종 전세보증금",
  "월세 조건",
  "계약금",
  "계약일",
  "잔금일",
  "인도일",
  "입주일",
  "방문일",
  "옵션",
  "수리 요청",
  "관리비",
];

/** 카드 생성 금지(이력 전용) 이름. */
export const HISTORY_ONLY = [
  "최초가",
  "매수 희망가",
  "매도 제안가",
  "임차 희망 조건",
  "임대 제안 조건",
];

/** 양측 표시 라벨. 임대차에서는 매수·매도 표현을 쓰지 않는다. */
export function sideLabels(tradeType: TradeType): { human: string; demo: string; owner: string } {
  if (tradeType === "매매") return { human: "매수자", demo: "AI 매도자(시연)", owner: "매도자" };
  return { human: "임차인", demo: "AI 임대인(시연)", owner: "임대인" };
}

export interface RentFields {
  deposit: number | null;
  monthlyRent: number | null;
}

function toAmount(num: string, unit: string | undefined): number | null {
  const n = parseFloat(num);
  if (!Number.isFinite(n) || n <= 0) return null;
  // 만원 단위 그대로 쓴다(월세 대화: "보증금 5000", "월세 65", "5000만원").
  if (!unit || unit === "만") return Math.round(n);
  if (unit === "억") return Math.round(n * 10000);
  return Math.round(n * 1000);
}

/**
 * 보증금·월세 필드를 문맥과 함께 뽑는다. 필드 단서(보증금·월세)가 있어야 하며
 * 서로 다른 두 금액을 한 가격으로 합치지 않는다. 파싱 실패는 null 필드다.
 */
export function parseRentFields(text: string): RentFields {
  const t = text.replace(/,/g, "");
  let deposit: number | null = null;
  const comp = t.match(/(전세보증금|보증금|전세)[^\d\n]{0,10}(\d+(?:\.\d+)?)\s*억\s*(\d+(?:\.\d+)?)?\s*(천만|천|만)?/);
  if (comp) {
    const base = parseFloat(comp[2]) * 10000;
    let rest = 0;
    if (comp[3]) {
      const r = parseFloat(comp[3]);
      rest = !comp[4] ? r : comp[4] === "만" ? r : r * 1000;
    }
    deposit = Math.round(base + rest);
  } else {
    const m = t.match(/(전세보증금|보증금|전세)[^\d\n]{0,10}(\d+(?:\.\d+)?)\s*(천만|천|만)?(?![\d.])/);
    if (m) deposit = toAmount(m[2], m[3]);
  }
  let monthlyRent: number | null = null;
  const rm = t.match(/월세[^\d\n]{0,10}(\d+(?:\.\d+)?)\s*(억|천만|천|만)?(?![\d.])/);
  if (rm) monthlyRent = toAmount(rm[1], rm[2]);
  if (deposit !== null && !(deposit > 0)) deposit = null;
  if (monthlyRent !== null && !(monthlyRent > 0)) monthlyRent = null;
  return { deposit, monthlyRent };
}

/** 월세 묶음 표준 표기. */
export function formatRentBundle(deposit: number, monthlyRent: number): string {
  return `보증금 ${deposit.toLocaleString()}만원/월세 ${monthlyRent.toLocaleString()}만원`;
}

/** 이력용 부분 표기(둘 중 있는 것만). 둘 다 없으면 ""다. */
export function formatRentPartial(f: RentFields): string {
  if (f.deposit !== null && f.monthlyRent !== null) return formatRentBundle(f.deposit, f.monthlyRent);
  if (f.deposit !== null) return `보증금 ${f.deposit.toLocaleString()}만원`;
  if (f.monthlyRent !== null) return `월세 ${f.monthlyRent.toLocaleString()}만원`;
  return "";
}

/** 표준 묶음 표기를 되돌린다. 두 값이 모두 있을 때만 인정한다. */
export function parseRentBundleValue(value: string): RentFields | null {
  const m = value.replace(/,/g, "").match(/^보증금\s*(\d+(?:\.\d+)?)만원\/월세\s*(\d+(?:\.\d+)?)만원$/);
  if (!m) return null;
  const deposit = Math.round(parseFloat(m[1]));
  const monthlyRent = Math.round(parseFloat(m[2]));
  if (!(deposit > 0) || !(monthlyRent > 0)) return null;
  return { deposit, monthlyRent };
}

/** 전세보증금 표준 표기. */
export function formatJeonseDeposit(deposit: number): string {
  return `전세보증금 ${deposit.toLocaleString()}만원`;
}

/** 전세보증금 표기를 되돌린다. */
export function parseJeonseValue(value: string): number | null {
  const m = value.replace(/,/g, "").match(/^(?:전세보증금|보증금)\s*(\d+(?:\.\d+)?)만원$/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1]));
  return n > 0 ? n : null;
}

/** 본문에 나온 만원 금액을 대충 모두 뽑는다(두 금액 해석 금지 검사 contradicted용). */
export function extractAllManwon(text: string): number[] {
  const out: number[] = [];
  const clean = text.replace(/,/g, "");
  const re = /(\d+(?:\.\d+)?)\s*(억|천만|천|만)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push(m[2] === "억" ? Math.round(n * 10000) : m[2] === "만" ? Math.round(n) : Math.round(n * 1000));
  }
  return out;
}

function numberNear(ev: string, cue: string, num: number): boolean {
  const idx = ev.indexOf(cue);
  if (idx < 0) return false;
  const window = ev.slice(idx + cue.length, idx + cue.length + 16);
  return window.includes(String(num));
}

/**
 * 월세 묶음 값이 원문 문맥으로 뒷받침되는지 확인한다.
 * 보증금·월세 두 값 각각이 자기 단서 곁에 있어야 한다.
 */
export function rentValueSupported(value: string, evidenceText: string): boolean {
  const b = parseRentBundleValue(value);
  if (!b || b.deposit === null || b.monthlyRent === null) return false;
  const ev = evidenceText.replace(/[\s,]/g, "");
  const depOk = numberNear(ev, "보증금", b.deposit) || numberNear(ev, "전세보증금", b.deposit);
  return depOk && numberNear(ev, "월세", b.monthlyRent);
}

const RENT_ACCEPT_CUES = /(가능합니다|좋습니다|그러시죠|알겠습니다|동의합니다|받겠습니다)/;
const RENT_REFUSE_CUES = /(어렵습니다|어렵다|안 됩니다|안됩니다|불가합니다|거절합니다)/;

function fieldsCover(parsed: RentFields, deposit: number, monthlyRent: number | null): boolean {
  if (parsed.deposit !== deposit) return false;
  if (monthlyRent !== null && parsed.monthlyRent !== monthlyRent) return false;
  return true;
}

/**
 * AI가 동일 조건의 모든 값을 명확하게 수락한 근거가 있는지 확인한다.
 * 파싱 실패·모호함은 false(보류)이며 거절이 아니다.
 */
export function aiAcceptsRentBundle(
  aiDated: Array<{ text: string; at: string }>,
  deposit: number,
  monthlyRent: number | null,
): boolean {
  return (aiDated ?? []).some(
    (d) => RENT_ACCEPT_CUES.test(d.text) && fieldsCover(parseRentFields(d.text), deposit, monthlyRent),
  );
}

/** AI가 같은 조건을 명확하게 거절한 근거가 있는지 확인한다. */
export function aiRefusesRentBundle(
  aiDated: Array<{ text: string; at: string }>,
  deposit: number,
  monthlyRent: number | null,
): boolean {
  return (aiDated ?? []).some(
    (d) => RENT_REFUSE_CUES.test(d.text) && fieldsCover(parseRentFields(d.text), deposit, monthlyRent),
  );
}

export interface LegacyProposalRow {
  room_id: string;
  name: string;
  value: string;
  status: string;
  trade_type: string;
}

/**
 * 기존 잘못 저장 행을 읽기 전용으로 진단한다. 수정하지 않고 보고만 낸다.
 * - 임대차 방의 매수·매도 이름 제안, 묶음 아닌 월세 카드, 근거 없는 거절.
 */
export function diagnoseLegacyProposals(rows: LegacyProposalRow[]): {
  leaseSaleNames: LegacyProposalRow[];
  monthlyNonBundle: LegacyProposalRow[];
  total: number;
} {
  const leaseSaleNames = rows.filter(
    (r) =>
      (r.trade_type === "전세" || r.trade_type === "월세") &&
      (r.name === "매수 희망가" || r.name === "매도 제안가"),
  );
  const monthlyNonBundle = rows.filter(
    (r) => r.trade_type === "월세" && r.name === "월세 조건" && parseRentBundleValue(r.value) === null,
  );
  return { leaseSaleNames, monthlyNonBundle, total: rows.length };
}
