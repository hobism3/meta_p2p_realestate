import {guardRead,guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";

/** Server-only moderator allowlist. Never accept role or reviewer flag from JWT user metadata. */
async function moderator(req:Request){
 const auth=await authenticate(req);if("error" in auth)return {error:ok({error:auth.error},auth.status)} as const;
 const approved=new Set((process.env.MODERATOR_USER_IDS??"").split(",").map(s=>s.trim()).filter(Boolean));
 if(!approved.has(auth.identity.userId))return {error:ok({error:"관리 권한이 없습니다."},403)} as const;
 return {userId:auth.identity.userId} as const;
}

export async function GET(req:Request):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 const mod=await moderator(req);if("error" in mod)return mod.error;
 const rows=await getDal().all(
  `SELECT r.id,r.listing_id,r.category,r.status,r.created_at,r.updated_at,l.title AS listing_title
   FROM listing_reports r LEFT JOIN custom_listings l ON l.id=r.listing_id
   ORDER BY r.created_at DESC LIMIT 100`,
 );
 // Do not return reporter account IDs on the moderation list.
 return ok({reports:rows.map(r=>({id:r.id,listingId:r.listing_id,category:r.category,
  status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,listingTitle:r.listing_title??"합성 예시 매물"}))});
}
export async function PATCH(req:Request):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const mod=await moderator(req);if("error" in mod)return mod.error;
 const parsed=await readJson(req);if("err" in parsed)return parsed.err;
 const b=parsed.value;
 if(typeof b.id!=="string"||!["triaged","closed"].includes(String(b.status)))
  return ok({error:"유효한 신고 ID와 처리 상태를 입력하세요."},400);
 const existing=await getDal().get("SELECT id FROM listing_reports WHERE id = ?",[b.id]);
 if(!existing)return ok({error:"신고를 찾을 수 없습니다."},404);
 await getDal().run("UPDATE listing_reports SET status=?,reviewed_by=?,updated_at=? WHERE id=?",
  [String(b.status),mod.userId,now(),b.id]);
 return ok({id:b.id,status:b.status,note:"신고 처리 상태 기록이며 허위매물 판단·자동 매물 삭제를 의미하지 않습니다."});
}
