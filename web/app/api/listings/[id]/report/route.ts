import {randomUUID} from "node:crypto";
import {guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";
import {SEED_LISTINGS} from "@/lib/listings";

type Ctx={params:{id:string}};
const REASONS=new Set(["misleading_listing","suspected_impersonation","incorrect_information","personal_information","other"]);

/** A real, durable report receipt—not a client-side "reported" boolean.
 * No free-text evidence or personal identifiers are collected.
 * Moderators must triage the report separately; receipt != successful removal.
 */
export async function POST(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const auth=await authenticate(req);if("error" in auth)return ok({error:auth.error},auth.status);
 const parsed=await readJson(req);if("err" in parsed)return parsed.err;
 const reason=parsed.value.category;
 if(typeof reason!=="string"||!REASONS.has(reason))return ok({error:"신고 유형을 선택해 주세요."},400);
 const listing=SEED_LISTINGS.some(l=>l.id===params.id) ||
  !!(await getDal().get("SELECT id FROM custom_listings WHERE id = ?",[params.id]));
 if(!listing)return ok({error:"신고 대상 매물을 찾을 수 없습니다."},404);
 const timestamp=now();
 await getDal().run(
  `INSERT INTO listing_reports(id,listing_id,reporter_user_id,category,status,created_at,updated_at)
   VALUES (?,?,?,?,'received',?,?)
   ON CONFLICT(listing_id,reporter_user_id,category) DO NOTHING`,
  [randomUUID(),params.id,auth.identity.userId,reason,timestamp,timestamp],
 );
 const row=await getDal().get(
  "SELECT id,status,created_at FROM listing_reports WHERE listing_id = ? AND reporter_user_id = ? AND category = ?",
  [params.id,auth.identity.userId,reason],
 );
 return ok({reportId:String(row?.id??""),status:String(row?.status??"received"),
  submittedAt:String(row?.created_at??timestamp),message:"신고를 기록했습니다. 내용의 사실 여부와 조치 여부는 아직 확인되지 않았습니다."},201);
}
