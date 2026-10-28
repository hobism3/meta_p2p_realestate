import { randomUUID } from "node:crypto";
import { bad, customListing, guardRead, guardWrite, notFound, ok, readJson } from "@/lib/api";
import { authenticate, supabaseConfigured } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { now, rowToListing } from "@/lib/db";
import { SEED_LISTINGS, type TradeType } from "@/lib/listings";

export async function GET(req: Request): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  const rows = await getDal().all("SELECT * FROM custom_listings ORDER BY created_at DESC");
  const custom = rows.map(rowToListing);
  const seeds = SEED_LISTINGS.map((l) => ({ ...l, editable: false }));
  return ok([...custom, ...seeds]);
}

export async function POST(req: Request): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  const a = await authenticate(req);
  if ("error" in a) return ok({ error: a.error }, a.status);
  const parsed = await readJson(req);
  if ("err" in parsed) return parsed.err;
  const b = parsed.value;
  const title = String(b.title ?? "").trim();
  const address = String(b.address ?? "").trim();
  const moveIn = String(b.moveIn ?? "").trim();
  const publisher = String(b.publisher ?? "").trim();
  const tradeType = String(b.tradeType ?? "월세");
  if (!title || !address || !moveIn || !publisher) return bad("필수 항목 누락");
  if (tradeType !== "월세" && tradeType !== "전세" && tradeType !== "매매") return bad("거래유형 오류");
  const nums = {
    deposit: Number(b.deposit ?? 0),
    salePrice: Number(b.salePrice ?? 0),
    rent: Number(b.rent ?? 0),
    fee: Number(b.fee ?? 0),
    area: Number(b.area ?? 0),
  };
  if (Object.values(nums).some((n) => !Number.isFinite(n) || n < 0)) return bad("금액·면적 오류");
  if (nums.area <= 0) return bad("면적 오류");
  if (tradeType === "월세" && nums.rent <= 0) return bad("월세 필수");
  if (tradeType === "매매" && nums.salePrice <= 0) return bad("매매가 필수");
  const options = Array.isArray(b.options) ? b.options.map(String) : [];
  const id = randomUUID();
  // 소유자 기록. supabase 모드는 토큰 sub, dev는 게시자 별명.
  const ownerId = supabaseConfigured() ? a.identity.userId : `dev:${publisher}`;
  const dal = getDal();
  await dal.withTransaction(async (tx) => {
    await tx.run(
      `INSERT INTO custom_listings
       (id,title,address,trade_type,deposit,rent,sale_price,fee,area,move_in,options_json,description,publisher,owner_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, title, address, tradeType as TradeType, nums.deposit,
        tradeType === "전세" ? 0 : nums.rent, nums.salePrice, nums.fee, nums.area,
        moveIn, JSON.stringify(options), String(b.description ?? ""), publisher, ownerId, now(),
      ],
    );
    await tx.upsertKey(id);
  });
  const created = await customListing(id);
  if (!created) return notFound("저장 실패");
  return ok(created, 201);
}
