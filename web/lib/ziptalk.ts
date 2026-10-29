/**
 * 집톡이 추출·분류 (순수 함수, mock 기반).
 * 제안·질문·희망·철회 구분, 변경·충돌 탐지, 원문 근거 연결.
 * 판단·확정은 하지 않는다.
 */
import { parseManwon } from "./visit-dates.ts";

export type UtteranceKind = "proposal" | "question" | "wish" | "withdraw";

export function classify(text: string): UtteranceKind {
  const t = text.trim();
  if (t.endsWith("?") || /언제|얼마|가능|여부|문의|알려/.test(t)) return "question";
  if (/취소|철회|안 하겠|없던 일|파기/.test(t)) return "withdraw";
  if (/제안|합시다|하자|하겠습니다|확정/.test(t)) return "proposal";
  if (/했으면|바라|희망|원해|좋겠/.test(t)) return "wish";
  return "wish";
}

export function extractPriceManwon(text: string): number | null {
  return parseManwon(text);
}

export interface ChangeEvent {
  conditionId: string;
  oldValue: string;
  newValue: string;
  msgId: string;
}

export function detectChange(
  conditionId: string,
  oldValue: string,
  newText: string,
  msgId: string,
): ChangeEvent | null {
  const price = extractPriceManwon(newText);
  if (price === null) return null;
  const next = `${price}만원`;
  if (next === oldValue) return null;
  return { conditionId, oldValue, newValue: next, msgId };
}

export interface Conflict {
  field: string;
  sideA: string;
  sideB: string;
  msgRefs: [string, string];
}

export function detectConflict(
  field: string,
  aText: string,
  aMsgId: string,
  bText: string,
  bMsgId: string,
): Conflict | null {
  const a = extractPriceManwon(aText);
  const b = extractPriceManwon(bText);
  if (a === null || b === null) return null;
  if (a === b) return null;
  return { field, sideA: `${a}만원`, sideB: `${b}만원`, msgRefs: [aMsgId, bMsgId] };
}

/** 판단·법률 문구가 섞였는지. 섞였으면 추출 결과로 쓰지 않는다. */
export function hasJudgment(text: string): boolean {
  return /등급|판결|소송|법률|특약|보증합니다|확정합니다/.test(text);
}
