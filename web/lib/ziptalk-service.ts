import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { classify, extractPriceManwon, hasJudgment } from "./ziptalk.ts";
import { parseVisitProposal, resolveVisitDateTime, parseMonthRef, parseManwonInt, parseManwon, bareHour } from "./visit-dates.ts";
import {
  callMeta,
  META_HISTORY_LIMIT,
  META_TIMEOUT_MS,
  META_DEFAULT_MODEL,
  type ChatMessage,
} from "./meta.ts";
import { isDemoListing, listingForDemo } from "./demo.ts";
import { getRoom } from "./rooms.ts";
import { bubbleFor, createProposals } from "./agreement-service.ts";
import {
  FINAL_PRICE_NAME,
  FINALIZABLE,
  extractAllManwon,
  formatJeonseDeposit,
  formatRentBundle,
  formatRentPartial,
  offerHistoryName,
  parseJeonseValue,
  parseRentBundleValue,
  parseRentFields,
  rentValueSupported,
  wantHistoryName,
  type RentFields,
} from "./rent.ts";
import type { TradeType } from "./listings.ts";
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
// Ziptalk needs a compact recent context and some headroom for structured JSON.
// On truncation we do NOT make another paid request: use the existing grounded
// deterministic analyzer and disclose it instead.
export const ZIPTALK_META_MAX_TOKENS = 1536;
export const ZIPTALK_META_HISTORY_LIMIT = 8;

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
export interface HistoryMsg {
  id: string;
  text: string;
  author_type: string;
  created_at?: string;
}

function isQuestionLike(t: string): boolean {
  const s = t.trim();
  return s.endsWith("?") || /(언제|몇 시|얼마인가|가능할까|될까|돼요\?|되나요|나요\?|가요\?|까요)/.test(s);
}

const PRICE_MARKERS = /(제안|깎|네고|하자|합시다|어때|어떠|안돼|안될까|조율|협의|가능합니다)/;

function asPriceProposal(text: string): number | null {
  const price = extractPriceManwon(text);
  if (price === null) return null;
  if (!PRICE_MARKERS.test(text)) return null;
  return price;
}

/** 입장 인사말은 제안이 아니다. 스캔 후보에서 제외한다. */
function isGreeting(text: string): boolean {
  const t = text.trim();
  return t.startsWith("안녕하세요,") && t.includes("(시연)입니다.");
}

/**
 * 계약금 표기를 만원 금액으로 바꾼다. 비율은 현재 협상가(매도 제안가→매수 희망가→최초가)
 * 기준으로 서버가 직접 계산한다. 기준가가 없으면 비율 원문을 둔다. 계산 불가면 null.
 */
export function depositAmount(
  text: string,
  current: Map<string, StoredCondition>,
  tradeType: TradeType = "매매",
): { value: string; note: string } | null {
  if (!PRICE_MARKERS.test(text)) return null;
  const flat = text.match(/계약금?\s*([\d,]+)\s*만\s*원/);
  if (flat) {
    const n = parseInt(flat[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n > 0) return { value: priceText(n), note: "" };
    return null;
  }
  const pct = text.match(/계약금?\s*(\d+(?:\.\d+)?)\s*(%|퍼센트|프로)/);
  if (pct) {
    const p = parseFloat(pct[1]);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) return null;
    const baseOrder =
      tradeType === "매매"
        ? ["매도 제안가", "매수 희망가", "최초가"]
        : [FINAL_PRICE_NAME[tradeType], offerHistoryName(tradeType), wantHistoryName(tradeType), "최초가"];
    for (const n of baseOrder) {
      const cv = current.get(n)?.value ?? "";
      const base = cv ? (tradeType === "매매" ? parseManwonInt(cv) : (parseRentFields(cv).deposit ?? parseManwonInt(cv))) : null;
      if (base) {
        return { value: priceText(Math.round((base * p) / 100)), note: `${cv}의 ${pct[1]}%` };
      }
    }
    return { value: `${pct[1]}%`, note: "" };
  }
  return null;
}

const VISIT_WORDS = ["방문", "보러", "구경", "보실 수 있", "보고싶", "보고 싶", "뵐", "만나"];

interface CandMsg {
  id: string;
  text: string;
  author_type: string;
  created_at?: string;
}

/** 이력 값(묶음·전세·부분 표기)을 필드로 되돌린다. */
function parseHistoryRent(value: string): RentFields {
  const b = parseRentBundleValue(value);
  if (b) return b;
  const j = parseJeonseValue(value);
  if (j !== null) return { deposit: j, monthlyRent: null };
  return parseRentFields(value);
}

function sideRentFields(
  side: "human" | "demo",
  tradeType: TradeType,
  current: Map<string, StoredCondition>,
  upserts: ConditionUpsert[],
): RentFields {
  const name = side === "human" ? wantHistoryName(tradeType) : offerHistoryName(tradeType);
  const u = upserts.find((x) => x.name === name);
  if (u) return parseHistoryRent(u.value);
  const c = current.get(name);
  if (c && c.value) return parseHistoryRent(c.value);
  return { deposit: null, monthlyRent: null };
}

function sideSalePrice(
  side: "human" | "demo",
  wantName: string,
  offerName: string,
  current: Map<string, StoredCondition>,
  upserts: ConditionUpsert[],
): number | null {
  const name = side === "human" ? wantName : offerName;
  const u = upserts.find((x) => x.name === name);
  if (u) return parseManwonInt(u.value);
  const c = current.get(name);
  if (c && c.value) return parseManwonInt(c.value);
  return null;
}

/** 수렴 근거 ID: 트리거 + 같은 값을 말한 상대 측 최신 1건. */
function evidenceForValue(cands: CandMsg[], triggerId: string, match: (text: string) => boolean): string[] {
  const ids = [triggerId];
  for (const c of cands) {
    if (c.id !== triggerId && match(c.text)) {
      ids.push(c.id);
      break;
    }
  }
  return ids;
}

export function analyzeMock(
  trigger: TriggerMsg,
  current: Map<string, StoredCondition>,
  refISO = "",
  history: HistoryMsg[] = [],
  tradeType: TradeType = "매매",
): AnalysisOutcome {
  const t = trigger.text.trim();
  const proposer = trigger.author_type === "human" ? "human" : "demo";
  const silent = { upserts: [], intervene: false, bubble: null };
  if (hasJudgment(t)) return silent;
  const cls = classify(t);
  // 매수자 희망가와 매도자 제안가는 별도 조건으로 유지한다. 서로 다른 가격을 자동 충돌·합의로 보지 않는다.
  // 트리거뿐 아니라 최근 대화까지 새 순서대로 훑어서 AI 답 속 제안을 놓치지 않는다.
  const wantName = wantHistoryName(tradeType);
  const offerName = offerHistoryName(tradeType);
  const finalName = FINAL_PRICE_NAME[tradeType];
  const pname = proposer === "human" ? wantName : offerName;
  // 사람 트리거는 사람 발화만 훑고, AI 트리거는 AI 자신의 발화를 포함한다.
  // 입장 인사말은 어느 경우에도 제안 근거가 되지 않는다. 같은 방 대화를 섞지 않는다.
  const cands: CandMsg[] = [
    { id: trigger.id, text: t, author_type: trigger.author_type, created_at: trigger.created_at },
    ...history.filter(
      (h) =>
        (h.author_type === "human" || (trigger.author_type === "demo_agent" && h.author_type === "demo_agent")) &&
        !isGreeting(h.text),
    ),
  ].filter((c) => !isGreeting(c.text));
  // 한 턴에 나온 복수 조건을 모두 모은다. 이름별로 최신(가장 새 Cand) 1건만 둔다.
  // 희망가·역제안은 협상 이력에만 남긴다. 동의 카드는 최종 협의 후보에만 만든다.
  const upserts: ConditionUpsert[] = [];
  const bubbles: string[] = [];
  if (tradeType === "매매") {
    const priceSeen = new Set<string>();
    for (const c of cands) {
      const pp = asPriceProposal(c.text);
      if (pp === null) continue;
      const cp = c.author_type === "human" ? "human" : "demo";
      const pn = cp === "human" ? wantName : offerName;
      if (priceSeen.has(pn)) continue;
      priceSeen.add(pn);
      const v = priceText(pp);
      const cur = current.get(pn);
      if (cur && cur.value && cur.value === v) continue;
      const isNew = !cur || !cur.value;
      upserts.push({ name: pn, value: v, proposer: cp, status: "proposed", evidence: [c.id] });
      if (pn === offerName) {
        bubbles.push(
          isNew
            ? `매도 제안이 ${v}으로 새로 나왔어요. 아직 확정되지는 않았습니다.`
            : `매도 제안이 ${cur.value}에서 ${v}로 변경됐어요. 아직 확정되지는 않았습니다.`,
        );
      } else {
        bubbles.push(
          isNew
            ? `가격이 ${v}으로 새로 제안됐어요. 아직 확정되지는 않았습니다.`
            : `가격이 ${cur.value}에서 ${v}로 변경됐어요. 아직 확정되지는 않았습니다.`,
        );
      }
      if (!isNew && cur.confirmedBy) bubbles.push(`이전에 확인한 ${cur.value}와 다릅니다. 다시 협의할까요?`);
    }
  } else {
    const rentSeen = new Set<string>();
    for (const c of cands) {
      let f = parseRentFields(c.text);
      if (tradeType === "전세") {
        if (f.deposit === null) {
          const pp = asPriceProposal(c.text);
          if (pp === null) continue;
          f = { deposit: pp, monthlyRent: null };
        } else {
          f = { deposit: f.deposit, monthlyRent: null };
        }
      } else if (f.deposit === null && f.monthlyRent === null) {
        continue;
      }
      const cp = c.author_type === "human" ? "human" : "demo";
      const pn = cp === "human" ? wantName : offerName;
      if (rentSeen.has(pn)) continue;
      rentSeen.add(pn);
      // 한 값만 바뀌면 같은 측의 기존 묶음에 합친다(원자적 현재 제안 유지).
      const cur = current.get(pn);
      const curF = cur && cur.value ? parseHistoryRent(cur.value) : { deposit: null, monthlyRent: null };
      const merged: RentFields =
        tradeType === "월세"
          ? { deposit: f.deposit ?? curF.deposit, monthlyRent: f.monthlyRent ?? curF.monthlyRent }
          : { deposit: f.deposit ?? curF.deposit, monthlyRent: null };
      const v = tradeType === "월세" ? formatRentPartial(merged) : merged.deposit !== null ? formatJeonseDeposit(merged.deposit) : "";
      if (!v) continue;
      if (cur && cur.value && cur.value === v) continue;
      const isNew = !cur || !cur.value;
      upserts.push({ name: pn, value: v, proposer: cp, status: "proposed", evidence: [c.id] });
      const label = tradeType === "월세" ? `${v} 조건` : v;
      bubbles.push(
        isNew
          ? `${label}이 새로 제안됐어요. 아직 확정되지는 않았습니다.`
          : `${label}으로 변경됐어요. 이전 ${cur.value}와 다릅니다. 아직 확정되지는 않았습니다.`,
      );
      if (!isNew && cur.confirmedBy) bubbles.push(`이전에 확인한 ${cur.value}와 다릅니다. 다시 협의할까요?`);
    }
  }
  // Explicit pet permission belongs to transaction-specific option conditions,
  // not to the original listing inventory. Questions never become permission.
  if (proposer === "demo") {
    const petReply = cands.find((c) => c.author_type === "demo_agent" &&
      /고양이|반려묘|반려동물|강아지|반려견/.test(c.text) &&
      /괜찮|가능|허용|키우셔도|키워도|안 됩니다|안돼|불가|금지|어렵/.test(c.text));
    if (petReply && /괜찮|가능|허용|키우셔도|키워도/.test(petReply.text) &&
        !/안 됩니다|안돼|불가|금지|어렵/.test(petReply.text) &&
        !isQuestionLike(petReply.text)) {
      const animal = /고양이|반려묘/.test(petReply.text) ? "반려묘" :
        /강아지|반려견/.test(petReply.text) ? "반려견" : "반려동물";
      const permission = animal + " 허용" + (/조용히/.test(petReply.text) ? "(조용히 키우는 조건)" : "");
      const prior = current.get("옵션")?.value ?? "";
      if (!prior.includes(animal + " 허용")) {
        const value = prior && !prior.includes("미확인") ? prior + " / " + permission : permission;
        upserts.push({name:"옵션",value,proposer:"demo",status:"proposed",evidence:[petReply.id]});
        bubbles.push(animal + " 조건도 이야기됐네요. 제안 내용을 카드에서 확인해 주세요.");
      }
    }
  }
  // A short affirmative is meaningful only if the preceding conversation
  // contains an explicit rental offer from the other side. No guessed amounts.
  if (tradeType === "월세" && proposer === "demo") {
    const humanIndex = history.findIndex((m) => m.author_type === "human" && m.id !== trigger.id);
    const recentHuman = humanIndex >= 0 ? history[humanIndex] : null;
    const affirmative = recentHuman && /^(전\s*)?(좋아요|동의해요|그렇게\s*해요|그\s*조건으로\s*할게요|그렇게\s*진행해요)[.!~ ]*$/.test(recentHuman.text.trim());
    // Only the immediately preceding AI turn can be accepted by a bare "좋아요".
    const previousAI = humanIndex >= 0 ? history.slice(humanIndex + 1).find((m) => m.author_type === "demo_agent") : undefined;
    const offer = previousAI && parseRentFields(previousAI.text).deposit !== null &&
      parseRentFields(previousAI.text).monthlyRent !== null ? previousAI : null;
    if (affirmative && offer) {
      const amount = parseRentFields(offer.text);
      const value = formatRentBundle(amount.deposit!,amount.monthlyRent!);
      const previous = current.get(wantName);
      if (previous?.value !== value && !upserts.some((u) => u.name === wantName)) {
        upserts.push({name:wantName,value,proposer:"human",status:"proposed",evidence:[recentHuman.id,offer.id]});
        bubbles.push("임차인도 상대방의 " + value + " 제안에 동의하셨네요. 양측 확정 카드로 확인할게요.");
      }
    }
  }
  // 양측 최신값이 수렴하면 최종 협의 후보 1건만 올린다. 희망·역제안에는 카드를 만들지 않는다.
  if (cls !== "withdraw") {
    if (tradeType === "매매") {
      const h = sideSalePrice("human", wantName, offerName, current, upserts);
      const o = sideSalePrice("demo", wantName, offerName, current, upserts);
      if (h !== null && o !== null && h === o) {
        const v = priceText(h);
        const cur = current.get(finalName);
        if (!cur || cur.value !== v) {
          upserts.push({
            name: finalName,
            value: v,
            proposer,
            status: "proposed",
            evidence: evidenceForValue(cands, trigger.id, (text) => extractPriceManwon(text) === h),
          });
          bubbles.push(`최종 매매가 ${v}으로 양측이 맞췄어요. 합의 카드에서 동의해 주세요.`);
        }
      }
    } else {
      const h = sideRentFields("human", tradeType, current, upserts);
      const o = sideRentFields("demo", tradeType, current, upserts);
      if (tradeType === "월세") {
        if (h.deposit !== null && h.monthlyRent !== null && h.deposit === o.deposit && h.monthlyRent === o.monthlyRent) {
          const v = formatRentBundle(h.deposit, h.monthlyRent);
          const cur = current.get(finalName);
          if (!cur || cur.value !== v) {
            upserts.push({
              name: finalName,
              value: v,
              proposer,
              status: "proposed",
              evidence: evidenceForValue(cands, trigger.id, (text) => {
                const f = parseRentFields(text);
                return f.deposit === h.deposit && f.monthlyRent === h.monthlyRent;
              }),
            });
            bubbles.push(`${v} 조건으로 양측이 맞췄어요. 합의 카드에서 동의해 주세요.`);
          }
        }
      } else if (h.deposit !== null && h.deposit === o.deposit) {
        const v = formatJeonseDeposit(h.deposit);
        const cur = current.get(finalName);
        if (!cur || cur.value !== v) {
          upserts.push({
            name: finalName,
            value: v,
            proposer,
            status: "proposed",
            evidence: evidenceForValue(cands, trigger.id, (text) => {
              const f = parseRentFields(text);
              if (f.deposit === h.deposit) return true;
              return asPriceProposal(text) === h.deposit;
            }),
          });
          bubbles.push(`${v}으로 양측이 맞췄어요. 합의 카드에서 동의해 주세요.`);
        }
      }
    }
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
  const visitCtx = cands.some((c) => VISIT_WORDS.some((w) => c.text.includes(w)));
  for (const c of cands) {
    const hasWord = VISIT_WORDS.some((w) => c.text.includes(w));
    if (!hasWord && !visitCtx) continue;
    if (isQuestionLike(c.text)) continue;
    // "그때 뵐게요" 같은 지시어는 같은 방의 가장 최근 방문일을 가리킨다. 확정 없이 묻기만 한다.
    if (/그때|그날|그 시간/.test(c.text)) {
      const prior = cands.slice(cands.indexOf(c) + 1).map((o) => parseVisitProposal(o.text, o.created_at || refISO || trigger.created_at)).find((p) => p && p.time);
      if (prior && prior.time) {
        bubbles.push(`${prior.display} 말씀하시는 거죠? 아직 확정되지는 않았습니다.`);
        break;
      }
      continue;
    }
    const previous = cands.slice(cands.indexOf(c) + 1)
      .filter((p) => p.id !== c.id)
      .map((p) => ({ id: p.id, text: p.text }));
    const resolved = resolveVisitDateTime(c.text, c.created_at || refISO || trigger.created_at, previous);
    const v = resolved?.visit;
    if (!v) continue;
    if (!hasWord && !v.time) continue;
    // 오전/오후 없는 1~11시는 추측하지 않고 후보로 묻는다. 기록·카드 금지.
    if (!v.time) {
      const bh = bareHour(c.text);
      if (bh !== null) {
        bubbles.push(`방문일로 ${v.display} 이야기가 나왔어요. ${v.display} 오후 ${bh}시 맞나요?`);
        break;
      }
    }
    const cur = current.get("방문일");
    if (cur && cur.value === v.display) break;
    const vp = c.author_type === "human" ? "human" : "demo";
    upserts.push({ name: "방문일", value: v.display, proposer: vp, status: "proposed", evidence: [c.id, ...(resolved?.evidence ?? [])] });
    bubbles.push(
      v.time
        ? `방문일로 ${v.display}가 제안됐어요. 거래 현황에서 확인해 주세요.`
        : `방문일로 ${v.display} 이야기가 나왔어요. 시간을 정해 주세요.`,
    );
    break;
  }
  // 거래 일정 스캔: 계약금·계약일·잔금일·인도일·입주일. 질문은 질문 분기에서 다룬다.
  const schedSeen = new Set<string>();
  const refTime = refISO || trigger.created_at;
  for (const c of cands) {
    if (isQuestionLike(c.text)) continue;
    const cp = c.author_type === "human" ? "human" : "demo";
    if (!schedSeen.has("계약금") && c.text.includes("계약금")) {
      const amt = depositAmount(c.text, current);
      if (amt) {
        schedSeen.add("계약금");
        upserts.push({ name: "계약금", value: amt.value, proposer: cp, status: "proposed", evidence: [c.id] });
        bubbles.push(
          amt.note
            ? `계약금이 ${amt.value}(${amt.note})으로 제안됐어요. 아직 확정되지는 않았습니다.`
            : `계약금이 ${amt.value}으로 제안됐어요. 아직 확정되지는 않았습니다.`,
        );
      }
    }
    const keys: Array<[string, string[]]> = [
      ["계약일", ["계약일", "계약"]],
      ["잔금일", ["잔금"]],
      ["인도일", ["인도"]],
      ["입주일", ["입주", "이사"]],
    ];
    for (const [name, words] of keys) {
      if (schedSeen.has(name)) continue;
      if (name === "계약일" && c.text.includes("계약금")) continue;
      if (!words.some((w) => c.text.includes(w))) continue;
      const sourceTime = c.created_at || refTime;
      const day = parseVisitProposal(c.text, sourceTime);
      const disp = day ? day.display : parseMonthRef(c.text, sourceTime)?.display ?? null;
      if (!disp) continue;
      const cur = current.get(name);
      if (cur && cur.value === disp) {
        schedSeen.add(name);
        continue;
      }
      schedSeen.add(name);
      const isNew = !cur || !cur.value;
      upserts.push({ name, value: disp, proposer: cp, status: "proposed", evidence: [c.id] });
      bubbles.push(
        isNew
          ? `${name}이 ${disp}으로 제안됐어요. 아직 확정되지는 않았습니다.`
          : `${name}이 ${cur.value}에서 ${disp}로 변경됐어요. 아직 확정되지는 않았습니다.`,
      );
      if (!isNew && cur.confirmedBy) bubbles.push(`이전에 확인한 ${cur.value}와 다릅니다. 다시 협의할까요?`);
    }
  }
  const qfin = upserts.filter((u) => u.name === finalName);
  if (upserts.length === qfin.length && cls === "question") {
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
      ["계약금", "계약금"],
      ["계약", "계약일"],
      ["잔금", "잔금일"],
      ["인도", "인도일"],
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
    const priceCue =
      tradeType === "매매"
        ? t.includes("가격") || t.includes("얼마") || t.includes("매매가")
        : t.includes("가격") || t.includes("얼마") || t.includes("보증금") || t.includes("월세") || t.includes("전세");
    if (priceCue) {
      const w = current.get(wantName);
      const o = current.get(offerName);
      const fin = current.get(finalName);
      if ((!w || !w.value) && (!o || !o.value) && (!fin || !fin.value)) {
        const f0 = current.get("최초가");
        if (f0 && f0.value) {
          return { upserts: [], intervene: true, bubble: `${tradeType === "월세" ? "기존 보증금과 월세" : tradeType === "전세" ? "기존 전세보증금" : "등록 매매가"}는 ${f0.value}입니다.` };
        }
        // 가격 질문은 조건을 만들지 않고 안내만 한다. 제안이 나와야 기록된다.
        return { upserts: [], intervene: true, bubble: "가격은 아직 확인되지 않았어요. 희망 조건을 말씀해 보세요." };
      }
      const bits: string[] = [];
      const f = current.get("최초가");
      if (f && f.value) bits.push(`${tradeType === "월세" ? "기존 보증금과 월세" : tradeType === "전세" ? "기존 전세보증금" : "등록 매매가"}는 ${f.value}`);
      if (tradeType === "매매") {
        if (w && w.value) bits.push(`매수 희망가는 ${w.value}`);
        if (o && o.value) bits.push(`매도 제안은 ${o.value}`);
      } else {
        if (fin && fin.value) bits.push(`${finalName}은 ${fin.value}`);
        if (w && w.value) bits.push(`${wantName}은 ${w.value}`);
        if (o && o.value) bits.push(`${offerName}은 ${o.value}`);
      }
      return { upserts: qfin, intervene: true, bubble: `${bits.join(", ")}입니다.` };
    }
  }
  // 잔금일과 입주일이 어긋나면 오류가 아니라 인도일 확인이 필요한 상태로 안내한다.
  // 이번 턴에 잔금·입주 중 하나라도 새로 잡혔을 때만 말한다.
  if (upserts.some((u) => u.name === "잔금일" || u.name === "입주일")) {
    const val = (n: string) => upserts.find((u) => u.name === n)?.value ?? current.get(n)?.value ?? "";
    const bal = val("잔금일");
    const mv = val("입주일");
    if (bal && mv && bal !== mv && !val("인도일")) {
      bubbles.push("잔금일과 입주일이 다릅니다. 인도일을 정할까요?");
    }
  }
  if (upserts.length === 0 && bubbles.length === 0) return silent;
  return { upserts, intervene: true, bubble: bubbles.join(" ") };
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
  if (!/\d/.test(v) || !/[만억천]/.test(v)) return v;
  const n = parseManwon(v);
  if (n === null) return v;
  return `${n.toLocaleString()}만원`;
}

/** 값에 나온 숫자·문구가 근거 문구에 실제로 있는지 확인한다. */
function valueSupported(value: string, evidenceText: string): boolean {
  const ev = evidenceText.replace(/\s/g, "");
  // 월 정밀도 값은 월이 원문에 있으면 뒷받침된 것으로 본다. 연도는 기준 시각에서 정규화된다.
  const ym = value.match(/^(\d{4})년\s*(\d{1,2})월$/);
  if (ym) return ev.includes(`${parseInt(ym[2], 10)}월`);
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
const SHARED_NAMES = ["최초가", "계약금", "입주일", "방문일", "계약일", "잔금일", "인도일", "옵션", "수리 요청", "관리비"];

function allowedNames(tradeType: TradeType): Set<string> {
  const extra =
    tradeType === "매매"
      ? ["매수 희망가", "매도 제안가", "최종 매매가"]
      : tradeType === "전세"
        ? ["임차 희망 조건", "임대 제안 조건", "최종 전세보증금"]
        : ["임차 희망 조건", "임대 제안 조건", "월세 조건"];
  return new Set([...SHARED_NAMES, ...extra]);
}

/** 최종 가격 근거에 서로 다른 두 금액이 섞여 있으면 true. 그런 조건은 버린다. */
function hasTwoPrices(text: string): boolean {
  const uniq = Array.from(new Set(extractAllManwon(text).filter((n) => n >= 1000)));
  return uniq.length >= 2;
}

export function validateZiptalkOutput(
  data: unknown,
  evidence: Map<string, EvidenceMsg>,
  tradeType: TradeType = "매매",
): ValidatedAnalysis | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { conditions?: unknown; intervene?: unknown; bubble?: unknown };
  if (!Array.isArray(d.conditions)) return null;
  const allowed = allowedNames(tradeType);
  const conditions: ValidatedCondition[] = [];
  for (const c of d.conditions.slice(0, 10)) {
    if (!c || typeof c !== "object") continue;
    const r = c as { name?: unknown; value?: unknown; proposer?: unknown; status?: unknown; evidence_ids?: unknown };
    if (typeof r.name !== "string" || !r.name.trim() || r.name.trim().length > 50) continue;
    // 임대차에서 매수 희망가·매도 제안가는 서버에서 거부한다. 원문 복원 불가분도 거부한다.
    if (!allowed.has(r.name.trim())) continue;
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
    const cname = r.name.trim();
    let normalized: string;
    if (cname === "월세 조건") {
      // 묶음은 원문으로 정확하게 복원될 때만 정규화한다. 하나만 있으면 버린다.
      const b = parseRentBundleValue(normalizeValue(r.value)) ?? parseRentBundleValue(r.value.trim());
      if (!b || b.deposit === null || b.monthlyRent === null) continue;
      normalized = formatRentBundle(b.deposit, b.monthlyRent);
      if (!rentValueSupported(normalized, joined)) continue;
    } else {
      normalized = normalizeValue(r.value);
      // 확정형 값(금액·날짜)은 원문 뒷받침 필수. 미확인 슬롯(값 비어 있음)은 질문 근거만으로 둔다.
      if (normalized && !valueSupported(normalized, joined) && !valueSupported(r.value.trim(), joined)) continue;
      // 최종 가격은 근거 한 메시지에 서로 다른 두 금액이 있으면 해석하지 않는다.
      if ((cname === "최종 매매가" || cname === "최종 전세보증금") && msgs.some((m) => hasTwoPrices(m.text))) continue;
    }
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
  tradeType: TradeType = "매매",
): ZiptalkInput {
  const factLines = Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`);
  const prevLines = prev.map((c) => `- ${c.name}=${c.value || "(미확인)"}(상태:${c.status},제안자:${c.proposer})`);
  const system = [
    "너는 임대인과 임차인이 함께 대화하는 그룹채팅에 직접 참여하는 집톡이다. 가격을 절충하거나 양측 대신 조건을 제안하지 마. 대화 중 빠진 확인 사항과 양측 확정 절차를 챙겨. 반드시 JSON 한 덩어리만 출력한다.",
    `[매물] ${listingTitle}`,
    ...factLines,
    `[지금까지 조건]${prevLines.length > 0 ? "" : " 없음"}`,
    ...prevLines,
    "[규칙]",
    "- 최초가는 과거 저장용 필드명이다. 월세에서는 사용자에게 기존 보증금·기존 월세로, 전세는 기존 전세보증금으로, 매매는 등록 매매가로 설명한다. 응답에서 최초가라는 단어를 쓰지 마.",
    "- 반려동물(가능/불가)은 옵션·생활 조건이며 가격 또는 최초가가 아니다. 에어컨·침대·가전은 제공 옵션, 시스템에어컨·확장/비확장은 설비/공간 특성이다. 질문만으로 허용 여부를 사실로 단정하지 마.",
    "- [매물] 제공옵션과 이미 정리된 값을 우선 사용하되, 매물 기본 옵션은 새로운 협상 합의 카드로 중복 생성하지 마.",
    tradeType === "매매"
      ? "- 조건 이름은 최초가·매수 희망가·매도 제안가·최종 매매가·계약금·입주일·방문일·계약일·잔금일·인도일·옵션·수리 요청·관리비만 쓴다. 매물 정가는 최초가, 사람의 희망은 매수 희망가, AI의 제안은 매도 제안가로 나눈다. 양측이 같은 값으로 맞췄을 때만 최종 매매가를 낸다. 희망·제안에는 동의 버튼이 없으며 최종 매매가에만 있다."
      : tradeType === "전세"
        ? "- 조건 이름은 최초가·임차 희망 조건·임대 제안 조건·최종 전세보증금·계약금·입주일·방문일·계약일·잔금일·인도일·옵션·수리 요청·관리비만 쓴다. 매수 희망가·매도 제안가·AI 매도자 표현은 절대 쓰지 마. 양측이 같은 보증금으로 맞췄을 때만 최종 전세보증금을 낸다. 희망·제안에는 동의 버튼이 없으며 최종 전세보증금에만 있다."
        : "- 조건 이름은 최초가·임차 희망 조건·임대 제안 조건·월세 조건·계약금·입주일·방문일·계약일·잔금일·인도일·옵션·수리 요청·관리비만 쓴다. 매수 희망가·매도 제안가·AI 매도자 표현은 절대 쓰지 마. 월세 조건은 보증금과 월세 두 값이 모두 '보증금 X만원/월세 Y만원' 묶음으로 있을 때만 낸다. 하나만 있으면 조건을 만들지 마. 양측이 두 값 모두 맞췄을 때만 월세 조건을 낸다. 희망·제안에는 동의 버튼이 없으며 월세 조건에만 있다.",
    "- 계약금은 비율 계산을 하지 말고 원문 그대로(예: 10%) 쓰거나, 금액이 분명할 때만 만원 단위로 쓴다.",
    "- 입주·잔금 월만 나왔으면 'YYYY년 M월' 형태로 쓰고 일을 만들지 마.",
    "- 잔금일과 입주일이 다르면 오류가 아니라 인도일 확인이 필요하다고 안내한다.",
    "- 값·제안자(human|demo)·근거 메시지 ID가 분명할 때만 조건으로 낸다. 근거 IDs는 아래 대화의 [id]만 쓴다.",
    "- 값은 근거 문구에 실제로 나온 형태만 쓴다. 연도는 근거에 있을 때만 쓰고, 없으면 월·일만 쓴다. 금액은 만원·억원 단위 그대로 쓴다.",
    "- 근거가 부족하거나 모호하면 조건을 만들지 마.",
    "- 이미 정리된 내용을 또 안내하지 마. 새 제안·변경·모순·미확인 발견이 없으면 intervene=false, bubble=null.",
    "- 질문에 대한 답이 [지금까지 조건]에 있으면 bubble에 한 문장으로 답한다(최초가·희망가·제안가를 그대로 전달). 답할 때도 협상·확정·판단은 하지 마.",
    "- bubble은 상담사 보고서가 아니라 그룹채팅 참여자 집톡이의 자연스러운 한마디로 말해. 예: '방문 시간이 오후 3시로 제안됐네요. 이대로 확정할지는 두 분이 각자 확인해 주세요.'",
    "- 한두 문장의 친근한 존댓말로 간결하게 말하되, 반말·과도한 감탄·개입 강요·뇌피셜·법적 판단을 삼가. 실제 사람이나 공인중개사인 척하지 마.",
    "- 결정된 사실과 제안된 조건을 반드시 구분해. 상대방의 동의가 없으면 '확정됐어요', '계약됐어요', '예약됐어요'라고 말하지 마.",
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
  listing: { tradeType: string; salePrice: number; deposit: number; rent: number },
  current: Map<string, StoredCondition>,
): Promise<void> {
  if (current.has("최초가")) return;
  const price = listing.tradeType === "매매" ? listing.salePrice : listing.deposit;
  if (!price || price <= 0) return;
  const digits = String(price);
  const seedValue =
    listing.tradeType === "월세" && listing.rent > 0
      ? formatRentBundle(listing.deposit, listing.rent)
      : listing.tradeType === "전세"
        ? formatJeonseDeposit(listing.deposit)
        : priceText(price);
  const rows = (await getDal().all("SELECT id, text FROM messages WHERE room_id = ? AND author_type = 'demo_agent' ORDER BY created_at ASC", [
    roomId,
  ])) as { id: string; text: string }[];
  const hit = rows.find((r) => String(r.text ?? "").replace(/[^\d]/g, "").includes(digits));
  if (!hit) return;
  await getDal().run(
    "INSERT INTO room_conditions (room_id,name,value,proposer,status,source_msg_ids,version,updated_at,confirmed_by,confirmed_at,confirmed_version) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id,name) DO NOTHING",
    [roomId, "최초가", seedValue, "demo", "proposed", JSON.stringify([String(hit.id)]), 1, now(), "", "", 0],
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
  const dal = getDal();
  const recent = (await dal.all(
    "SELECT id, text, author_type, created_at FROM messages WHERE room_id = ? AND (author_type = 'human' OR author_type = 'demo_agent') ORDER BY created_at DESC LIMIT 8",
    [roomId],
  )) as { id: string; text: string; author_type: string; created_at: string }[];
  const previous = recent
    .filter((r) => String(r.id) !== trigger.id)
    .map((r) => ({ id: String(r.id), text: String(r.text ?? ""), created_at: String(r.created_at ?? "") }));
  const visitContext = [t, ...previous.slice(0, 6).map((r) => r.text)]
    .some((line) => VISIT_WORDS.some((w) => line.includes(w)));
  if (!visitContext || isQuestionLike(t)) return null;
  const resolved = resolveVisitDateTime(t, trigger.created_at, previous);
  const v = resolved?.visit;
  if (!v?.time) return null;
  const dup = await dal.get(
    "SELECT id FROM visits WHERE room_id = ? AND visit_date = ? AND visit_time = ? AND status IN ('제안됨','수락됨')",
    [roomId, v.date, v.time],
  );
  if (dup) return String(dup.id);
  const room = await getRoom(roomId);
  const id = randomUUID();
  await dal.run(
    "INSERT INTO visits (id,listing_id,visit_date,visit_time,status,room_id,created_at,proposed_by,source_msg_ids,decided_by,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, room ? room.listing_id : "", v.date, v.time, "제안됨", roomId, now(), proposer, JSON.stringify([trigger.id, ...(resolved?.evidence ?? [])]), "", ""],
  );
  return id;
}

/**
 * 일정 수락 원자 처리. 방문 수락과 방문일 조건 확인을 한 트랜잭션으로 묶는다.
 * 버전이 어긋나면 둘 다 바꾸지 않고 409를 낸다. AI 시연 동의는 여기서 확인으로 쓰지 않는다.
 */
export async function acceptVisit(
  roomId: string,
  visitId: string,
  userId: string,
  expectedVersion?: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const dal = getDal();
  let result: { ok: true } | { ok: false; status: number; error: string } = { ok: true };
  await dal.withTransaction(async (tx) => {
    const visit = await tx.get("SELECT status FROM visits WHERE id = ? AND room_id = ?", [visitId, roomId]);
    if (!visit) {
      result = { ok: false, status: 404, error: "일정 없음" };
      return;
    }
    if (String(visit.status ?? "") !== "제안됨") {
      result = { ok: false, status: 409, error: "이미 처리된 일정" };
      return;
    }
    const cond = await tx.get("SELECT version FROM room_conditions WHERE room_id = ? AND name = '방문일'", [roomId]);
    if (cond && expectedVersion !== undefined && Number(cond.version ?? 0) !== expectedVersion) {
      result = { ok: false, status: 409, error: `버전 불일치(현재 ${Number(cond.version ?? 0)})` };
      return;
    }
    await tx.run("UPDATE visits SET status = '수락됨', decided_by = ?, decided_at = ? WHERE id = ?", [
      userId,
      now(),
      visitId,
    ]);
    if (cond) {
      await tx.run(
        "UPDATE room_conditions SET confirmed_by = ?, confirmed_at = ?, confirmed_version = version WHERE room_id = ? AND name = '방문일'",
        [userId, now(), roomId],
      );
    }
  });
  return result;
}

export interface ZiptalkOk {
  ok: true;
  created: boolean;
  bubbleMessageId: string | null;
  applied: number;
  provider: DemoProvider;
  model: string;
  fallback?: "meta_truncated";
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
  reconcile?: boolean;
}): Promise<ZiptalkOk | ZiptalkErr> {
  const provider = opts.reconcile ? "mock" : opts.provider ?? resolveProvider();
  const agentType = opts.reconcile ? "ziptalk_reconcile_v2" : "ziptalk";
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
      [runId, opts.roomId, trigger.id, agentType, provider, model, "running", 0, "", "{}", "", "", now(), ZIPTALK_VERSION],
    );
  } catch {
    const existing = await dal.get("SELECT * FROM agent_runs WHERE room_id = ? AND trigger_msg_id = ? AND agent_type = ?", [
      opts.roomId,
      trigger.id,
      agentType,
    ]);
    if (!existing) throw new Error("실행 등록 실패");
    const st = String(existing.status ?? "");
    if (st === "done") {
      return {
        ok: true, created: false,
        bubbleMessageId: String(existing.message_id ?? "") || null,
        applied: 0, provider: (String(existing.provider ?? "") === "meta" ? "meta" : "mock") as DemoProvider,
        model: String(existing.model ?? model),
        fallback: String(existing.usage_json ?? "").includes('"fallback":"meta_truncated"')
          ? "meta_truncated" : undefined,
      };
    }
    if (st === "failed") {
      await dal.run("UPDATE agent_runs SET status = 'running', error = '', latency_ms = ? WHERE id = ?", [0, String(existing.id)]);
      return executeZiptalk(String(existing.id), opts.roomId, trigger, listing, current, provider, model, opts.reconcile ? 40 : 6);
    }
    return { ok: false, status: 409, error: "처리 중", provider, model };
  }
  return executeZiptalk(runId, opts.roomId, trigger, listing, current, provider, model, opts.reconcile ? 40 : 6);
}

async function executeZiptalk(
  runId: string,
  roomId: string,
  trigger: TriggerMsg,
  listing: NonNullable<Awaited<ReturnType<typeof listingForDemo>>>,
  current: Map<string, StoredCondition>,
  provider: DemoProvider,
  model: string,
  historyLimit = 6,
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
    let actualProvider = provider;
    let actualModel = model;
    let fallback: "meta_truncated" | undefined;
    const tradeType: TradeType = listing.tradeType === "전세" || listing.tradeType === "월세" ? listing.tradeType : "매매";
    if (provider === "meta") {
      const history = (await getDal().all(
        "SELECT id, author_type, author, text FROM messages WHERE room_id = ? ORDER BY created_at ASC",
        [roomId],
      )) as { id: string; author_type: string; author: string; text: string }[];
      const facts: Record<string, string> = {
        매물명: listing.title,
        입주일: listing.moveIn || "협의 가능",
        면적: `${listing.area}㎡`,
        제공옵션: listing.options?.join(", ") || "미기재",
      };
      if (tradeType === "매매") facts["가격"] = `${listing.salePrice.toLocaleString()}만원`;
      else if (tradeType === "전세") facts["전세보증금"] = `${listing.deposit.toLocaleString()}만원`;
      else {
        facts["보증금"] = `${listing.deposit.toLocaleString()}만원`;
        facts["월세"] = `${listing.rent.toLocaleString()}만원`;
      }
      const prev = Array.from(current.values());
      const input = buildZiptalkInput(listing.title, facts, prev, history.slice(-ZIPTALK_META_HISTORY_LIMIT), tradeType);
      const r = await callMeta(
        { system: input.system, messages: input.messages, maxTokens: ZIPTALK_META_MAX_TOKENS, timeoutMs: META_TIMEOUT_MS },
      );
      if (!r.ok && r.kind === "truncated") {
        // A response cut off at the token limit has no trustworthy JSON to
        // apply. Never use partial output or make an invisible paid retry.
        const recent = history
          .filter((m) => m.author_type === "human" || m.author_type === "demo_agent")
          .slice(-6).reverse()
          .map((m) => ({ id: String(m.id), author_type: String(m.author_type), text: String(m.text ?? "") }));
        outcome = analyzeMock(trigger, current, trigger.created_at, recent, tradeType);
        actualProvider = "mock";
        actualModel = ZIPTALK_VERSION;
        fallback = "meta_truncated";
        usageJson = JSON.stringify({
          fallback, metaInputTokens: r.usage?.inputTokens ?? 0, metaOutputTokens: r.usage?.outputTokens ?? 0,
        });
        console.warn("[ziptalk] Meta output exhausted; used grounded deterministic fallback (no retry)");
      } else {
        if (!r.ok) {
          if (r.kind === "no_key") return fail("모델 키 없음. 서버에 MODEL_API_KEY를 설정하세요.", 503, r.kind);
          if (r.kind === "timeout") return fail("모델 응답 시간 초과.", 502, r.kind);
          if (r.kind === "http") {
            return fail(`모델 오류(상태 ${r.status ?? "?"}${r.detail ? `: ${r.detail}` : ""}).`, 502, `${r.kind}:${r.status ?? "?"}`);
          }
          if (r.kind === "network") return fail("모델 연결 실패.", 502, r.kind);
          // Never print raw provider response keys or partial text to end users.
          return fail("모델 분석 응답 형식 오류. 다시 시도해 주세요.", 502, r.kind);
        }
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(r.text);
        } catch {
          parsed = null;
        }
        const ev = new Map(history.map((m) => [String(m.id), { author_type: String(m.author_type ?? ""), text: String(m.text ?? "") }]));
        const validated = validateZiptalkOutput(parsed, ev, tradeType);
        if (!validated) return fail("분석 결과 형식 오류.", 502, "bad_shape");
        outcome = { upserts: validated.conditions, intervene: validated.intervene, bubble: validated.bubble };
        usageJson = JSON.stringify({ inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
      }
    } else {
      const recent = (await getDal().all(
        "SELECT id, author_type, text, created_at FROM messages WHERE room_id = ? AND (author_type = 'human' OR author_type = 'demo_agent') ORDER BY created_at DESC LIMIT " + historyLimit,
        [roomId],
      )) as { id: string; author_type: string; text: string; created_at: string }[];
      outcome = analyzeMock(
        trigger,
        current,
        trigger.created_at,
        recent.map((r) => ({ id: String(r.id), text: String(r.text ?? ""), author_type: String(r.author_type ?? ""), created_at: String(r.created_at ?? "") })),
        tradeType,
      );
    }
    // Deterministic evidence-backed visit correction for Meta that omitted a spoken hour.
    // Never interpret a question as agreement; never mark a visit confirmed.
    if (provider === "meta" && !isQuestionLike(trigger.text)) {
      const ctx = (await getDal().all(
        "SELECT id, text, created_at FROM messages WHERE room_id = ? AND (author_type = 'human' OR author_type = 'demo_agent') ORDER BY created_at DESC LIMIT 8",
        [roomId],
      )) as Array<{ id: string; text: string; created_at: string }>;
      const previous = ctx.filter((m) => String(m.id) !== trigger.id)
        .map((m) => ({ id: String(m.id), text: String(m.text), created_at: String(m.created_at) }));
      const intent = [trigger.text, ...previous.slice(0, 6).map((m) => m.text)]
        .some((t) => VISIT_WORDS.some((w) => t.includes(w)));
      const resolved = intent ? resolveVisitDateTime(trigger.text, trigger.created_at, previous) : null;
      const visit = resolved?.visit;
      if (visit?.time && current.get("방문일")?.value !== visit.display) {
        const visitChange: ConditionUpsert = {
          name: "방문일", value: visit.display,
          proposer: trigger.author_type === "human" ? "human" : "demo",
          status: "proposed", evidence: [trigger.id, ...(resolved?.evidence ?? [])],
        };
        outcome.upserts = [...outcome.upserts.filter((u) => u.name !== "방문일"), visitChange];
        const genericDateClaim = /방문일로[^.。\n]*?(시간을 정해 주세요|시간을 정해|이야기가 나왔어요)/;
        const bubble = (outcome.bubble ?? "").replace(genericDateClaim, "").trim();
        const grounded = `방문 일정은 ${visit.display}로 제안됐어요. 거래 현황에서 확인해 주세요.`;
        outcome.bubble = `${bubble ? bubble + " " : ""}${grounded}`.slice(0, ZIPTALK_BUBBLE_LIMIT);
        outcome.intervene = true;
      }
    }
    if (provider === "meta") {
      const recent = (await getDal().all(
        "SELECT id, author_type, text FROM messages WHERE room_id = ? AND (author_type = 'human' OR author_type = 'demo_agent') ORDER BY created_at DESC LIMIT 8",
        [roomId],
      )) as Array<{ id: string; author_type: string; text: string }>;
      const grounded = analyzeMock(trigger, current, trigger.created_at,
        recent.map((r) => ({ id: String(r.id), author_type: String(r.author_type), text: String(r.text ?? "") })),
        tradeType);
      const reviewedNames = new Set(["임차 희망 조건", "임대 제안 조건", "월세 조건", "옵션"]);
      const additions = grounded.upserts.filter((u) => reviewedNames.has(u.name) &&
        !outcome.upserts.some((old) => old.name === u.name));
      if (additions.length) {
        outcome.upserts.push(...additions);
        outcome.intervene = true;
        const note = grounded.bubble ?? "두 분이 이야기한 조건을 확인 카드에 정리했어요.";
        outcome.bubble = [outcome.bubble, note].filter(Boolean).join(" ").slice(0, ZIPTALK_BUBBLE_LIMIT);
      }
    }
    const applied = await applyOutcome(roomId, outcome);
    // 방문 행을 먼저 맞춰야 제안 카드에 visit_id가 연결된다.
    // 사람 발화를 먼저 동기화한다. AI가 받아 말한 일정도 사람이 제안한 것으로 둔다.
    // 같은 일시는 중복 생성되지 않으므로 AI 되풀이가 제안자를 덮지 않는다.
    let visitDone: string | null = null;
    if (trigger.author_type === "human") {
      visitDone = await syncVisitProposal(roomId, trigger, "human");
    } else {
      const hm = (await getDal().get(
        "SELECT id, text, created_at FROM messages WHERE room_id = ? AND author_type = 'human' ORDER BY created_at DESC LIMIT 1",
        [roomId],
      )) as { id: string; text: string; created_at: string } | undefined;
      if (hm) {
        visitDone =
          (await syncVisitProposal(
            roomId,
            { id: String(hm.id), author_type: "human", author: "", text: String(hm.text ?? ""), created_at: String(hm.created_at ?? "") },
            "human",
          )) ?? null;
      }
      visitDone = (await syncVisitProposal(roomId, trigger, "demo")) ?? visitDone;
    }
    // 최종 협의 후보만 양측 합의 카드를 만든다. 희망·역제안 이력은 카드가 없다.
    const concrete = outcome.upserts.filter((u) => u.value && u.status === "proposed" && FINALIZABLE.includes(u.name));
    if (concrete.length > 0) {
      const created = await createProposals(
        roomId,
        concrete.map((u) => ({
          name: u.name,
          value: u.value,
          evidence: u.evidence,
          visitId: u.name === "방문일" ? visitDone ?? "" : "",
          refISO: trigger.created_at,
          createdBy: u.proposer === "demo" ? "demo" : "human",
        })),
      );
      // 새로 생긴 카드만 안내한다. 기존 제안을 되풀이하지 않고 카드 ID도 덮어쓰지 않는다.
      const fresh = created.filter((c) => c.isNew);
      const cardText = bubbleFor(fresh, tradeType);
      if (cardText && fresh.length > 0) {
        let cardMsgId = applied.bubbleMessageId;
        if (!cardMsgId) {
          cardMsgId = randomUUID();
          const listingRow = await getDal().get("SELECT listing_id FROM deal_rooms WHERE id = ?", [roomId]) as
            | { listing_id: string }
            | undefined;
          await getDal().run(
            "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [cardMsgId, listingRow ? String(listingRow.listing_id) : "", ZIPTALK_AUTHOR, "", `agent:${roomId}:ziptalk`, "assistant", roomId, cardText, now()],
          );
        } else {
          const prev = (await getDal().get("SELECT text FROM messages WHERE id = ?", [cardMsgId])) as
            | { text: string }
            | undefined;
          await getDal().run("UPDATE messages SET text = ? WHERE id = ?", [
            `${String(prev?.text ?? "")} ${cardText}`.slice(0, 900),
            cardMsgId,
          ]);
        }
        for (const c of fresh) {
          await getDal().run("UPDATE room_proposals SET card_msg_id = ? WHERE id = ? AND (card_msg_id IS NULL OR card_msg_id = '')", [cardMsgId, c.id]);
        }
        if (!applied.bubbleMessageId) applied.bubbleMessageId = cardMsgId;
      }
    }
    await getDal().run(
      "UPDATE agent_runs SET status = 'done', provider = ?, model = ?, latency_ms = ?, usage_json = ?, message_id = ?, summary = ? WHERE id = ?",
      [actualProvider, actualModel, Date.now() - started, usageJson, applied.bubbleMessageId ?? "", (outcome.bubble ?? "").slice(0, 120), runId],
    );
    return {
      ok: true, created: applied.bubbleMessageId !== null, bubbleMessageId: applied.bubbleMessageId,
      applied: applied.applied, provider: actualProvider, model: actualModel, fallback,
    };
  } catch (e) {
    return fail(e instanceof Error ? `실행 오류: ${e.message}`.slice(0, 200) : "실행 오류.", 502, "exception");
  }
}
