import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { SEED_LISTINGS } from "./listings.ts";
import { draftReply, type Scenario } from "./agent.ts";
import { getPersona, policyToNegotiable } from "./personas.ts";

/**
 * VS-2B 시연용 AI 상대방(mock 재료). 실제 모델 호출이 아니다.
 * 소유자 없는 매물(합성 시드 등)의 방에만 붙는다. 실제 사용자 매물 방에는 절대 끼지 않는다.
 * AI 생성 실행은 lib/agent-service.ts가 맡는다. 여기는 재료(매물·시나리오·첫인사)만 둔다.
 */

export function demoName(tradeType: string): string {
  return tradeType === "매매" ? "AI 매도자" : "AI 임대인";
}

export interface DemoListing {
  id: string;
  title: string;
  tradeType: string;
  salePrice: number;
  deposit: number;
  rent: number;
  area: number;
  moveIn: string;
  options: string[];
  description: string;
  ownerId: string;
}

export async function listingForDemo(listingId: string): Promise<DemoListing | null> {
  const seed = SEED_LISTINGS.find((l) => l.id === listingId);
  if (seed) {
    return {
      id: seed.id, title: seed.title, tradeType: seed.tradeType,
      salePrice: seed.salePrice, deposit: seed.deposit, rent: seed.rent,
      area: seed.area, moveIn: seed.moveIn, options: seed.options,
      description: seed.description, ownerId: "",
    };
  }
  const row = await getDal().get("SELECT * FROM custom_listings WHERE id = ?", [listingId]);
  if (!row) return null;
  let options: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.options_json ?? "[]"));
    if (Array.isArray(parsed)) options = parsed.map(String);
  } catch {
    options = [];
  }
  return {
    id: listingId,
    title: String(row.title),
    tradeType: String(row.trade_type),
    salePrice: Number(row.sale_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    rent: Number(row.rent ?? 0),
    area: Number(row.area ?? 0),
    moveIn: String(row.move_in ?? ""),
    options,
    description: String(row.description ?? ""),
    ownerId: String(row.owner_id ?? ""),
  };
}

export function isDemoListing(l: DemoListing | null): boolean {
  return !!l && !l.ownerId;
}

export function priceText(l: DemoListing): string {
  if (l.tradeType === "매매") return `매매 ${l.salePrice.toLocaleString()}만원`;
  if (l.tradeType === "전세") return `전세 ${l.deposit.toLocaleString()}만원`;
  return `${l.deposit.toLocaleString()}/${l.rent.toLocaleString()}만원`;
}

export function scenarioFor(l: DemoListing): Scenario {
  const price = l.tradeType === "매매" ? l.salePrice : l.deposit;
  const persona = getPersona(l.id);
  const facts: Record<string, string> = {
    매물명: l.title,
    가격: `${price.toLocaleString()}만원`,
    입주일: l.moveIn || "협의 가능",
    면적: `${l.area}㎡`,
    옵션: l.options.length > 0 ? l.options.join(", ") : "없음",
  };
  if (l.description.trim()) facts["설명"] = l.description.trim();
  // 명시 정책만 쓴다. blanket 90~100% 방식은 폐지. persona 없는 매물은 기존 방식 유지.
  const negotiable: Scenario["negotiable"] = persona
    ? policyToNegotiable(persona.policy, "만원")
    : price > 0
      ? { 가격: { min: Math.round(price * 0.9), max: price, unit: "만원" } }
      : {};
  return { persona: persona ? persona.name : demoName(l.tradeType), side: "seller", facts, negotiable };
}

export function demoGreeting(l: DemoListing): string {
  return `안녕하세요, ${demoName(l.tradeType)}(시연)입니다. ${l.title} ${priceText(l)}, ${l.moveIn || "입주 협의 가능"}합니다. 궁금한 점을 물어보세요.`;
}

async function insertDemo(roomId: string, listingId: string, author: string, text: string): Promise<void> {
  await getDal().run(
    "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [randomUUID(), listingId, author, "", "demo:ai", "demo_agent", roomId, text, now()],
  );
}

/** 방 생성 직후 시연방이면 AI 첫인사를 남긴다. 모델 호출이 아니라 정형 문구다. 실거래방에는 아무것도 하지 않는다. */
export async function maybeDemoGreeting(roomId: string, listingId: string): Promise<void> {
  const l = await listingForDemo(listingId);
  if (!isDemoListing(l)) return;
  await insertDemo(roomId, listingId, demoName(l!.tradeType), demoGreeting(l!));
}

/** mock 응답 1건. Agent Service가 mock provider로 쓸 때 호출한다. */
export function mockReplyText(scenario: Scenario, humanText: string): string {
  return draftReply(scenario, humanText).text;
}
