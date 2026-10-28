import { randomUUID } from "node:crypto";
import { getDal } from "./dal";
import { now } from "./db";
import { SEED_LISTINGS } from "./listings";
import { draftReply, type Scenario } from "./agent";

/**
 * VS-2B 시연용 AI 상대방(mock). 실제 모델 호출이 아니다.
 * 소유자 없는 매물(합성 시드 등)의 방에만 붙는다. 실제 사용자 매물 방에는 절대 끼지 않는다.
 * 사람 메시지 1건당 AI 응답은 최대 1건이다.
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
  ownerId: string;
}

export async function listingForDemo(listingId: string): Promise<DemoListing | null> {
  const seed = SEED_LISTINGS.find((l) => l.id === listingId);
  if (seed) {
    return {
      id: seed.id, title: seed.title, tradeType: seed.tradeType,
      salePrice: seed.salePrice, deposit: seed.deposit, rent: seed.rent,
      area: seed.area, moveIn: seed.moveIn, ownerId: "",
    };
  }
  const row = await getDal().get("SELECT * FROM custom_listings WHERE id = ?", [listingId]);
  if (!row) return null;
  return {
    id: listingId,
    title: String(row.title),
    tradeType: String(row.trade_type),
    salePrice: Number(row.sale_price ?? 0),
    deposit: Number(row.deposit ?? 0),
    rent: Number(row.rent ?? 0),
    area: Number(row.area ?? 0),
    moveIn: String(row.move_in ?? ""),
    ownerId: String(row.owner_id ?? ""),
  };
}

export function isDemoListing(l: DemoListing | null): boolean {
  return !!l && !l.ownerId;
}

function priceText(l: DemoListing): string {
  if (l.tradeType === "매매") return `매매 ${l.salePrice.toLocaleString()}만원`;
  if (l.tradeType === "전세") return `전세 ${l.deposit.toLocaleString()}만원`;
  return `${l.deposit.toLocaleString()}/${l.rent.toLocaleString()}만원`;
}

function scenarioFor(l: DemoListing): Scenario {
  const price = l.tradeType === "매매" ? l.salePrice : l.deposit;
  const facts: Record<string, string> = {
    가격: `${price.toLocaleString()}만원`,
    입주일: l.moveIn || "협의 가능",
    면적: `${l.area}㎡`,
  };
  const negotiable: Scenario["negotiable"] = {};
  if (price > 0) {
    negotiable["가격"] = { min: Math.round(price * 0.9), max: price, unit: "만원" };
  }
  return { persona: demoName(l.tradeType), side: "seller", facts, negotiable };
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

/** 방 생성 직후 시연방이면 AI 첫인사를 남긴다. 실거래방에는 아무것도 하지 않는다. */
export async function maybeDemoGreeting(roomId: string, listingId: string): Promise<void> {
  const l = await listingForDemo(listingId);
  if (!isDemoListing(l)) return;
  await insertDemo(roomId, listingId, demoName(l!.tradeType), demoGreeting(l!));
}

// 같은 방의 동시 응답을 직렬화하는 프로세스 내 뮤텍스. mock 시연용이다.
const locks = new Map<string, Promise<void>>();

/**
 * 사람 메시지 뒤에 AI 응답을 최대 1건 붙인다.
 * 마지막 메시지가 사람이 아니면(이미 답했으면) 스킵한다. 실거래방에는 끼지 않는다.
 */
export async function maybeDemoReply(roomId: string, listingId: string, humanText: string): Promise<boolean> {
  const l = await listingForDemo(listingId);
  if (!isDemoListing(l)) return false;
  const prev = locks.get(roomId) ?? Promise.resolve();
  let release: () => void = () => {};
  const cur = prev.then(() => new Promise<void>((res) => { release = res; }));
  locks.set(roomId, cur);
  await prev;
  try {
    const rows = await getDal().all(
      "SELECT author_type FROM messages WHERE room_id = ? ORDER BY created_at ASC",
      [roomId],
    );
    if (rows.length === 0) return false;
    if (String(rows[rows.length - 1].author_type) !== "human") return false;
    const reply = draftReply(scenarioFor(l!), humanText);
    await insertDemo(roomId, listingId, demoName(l!.tradeType), reply.text);
    return true;
  } finally {
    release();
    if (locks.get(roomId) === cur) locks.delete(roomId);
  }
}
