import {guardRead,guardWrite,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";
import {BRIEF_SOURCE,sanitizeSharedRights,safePublicBriefRow,validBriefDate} from "@/lib/listing-rights-brief";

type Ctx={params:{id:string}};
async function readSmallJson(req:Request):Promise<Record<string,unknown>|null>{
 if(!req.body)return null;
 let n=0;const buffers:Uint8Array[]=[];
 const reader=req.body.getReader();
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   n+=value.byteLength;if(n>18*1024){await reader.cancel().catch(()=>{});return null;}
   buffers.push(value);
  }
  const all=new Uint8Array(n);let offset=0;
  for(const bytes of buffers){all.set(bytes,offset);offset+=bytes.length;}
  const value=JSON.parse(new TextDecoder().decode(all)) as unknown;
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  return value as Record<string,unknown>;
 }catch{return null;}finally{reader.releaseLock();}
}
function fail(error:string,status:number){return ok({error},status);}
export async function GET(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 const row=await getDal().get("SELECT issued_on,rights_json,shared_at FROM listing_rights_briefs WHERE listing_id=?",[params.id]);
 return ok(safePublicBriefRow(row));
}
export async function POST(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const a=await authenticate(req);if("error"in a)return fail(a.error,a.status);
 const body=await readSmallJson(req);
 if(!body)return fail("공개 권리요약 요청 형식이 올바르지 않거나 너무 큽니다.",413);
 if(body.confirmSharing!==true||body.acceptUnverified!==true||body.synthetic===true)
  return fail("게시자 직접 공유·독립 검증 미완료 고지를 확인해야 합니다.",400);
 const rights=sanitizeSharedRights(body.rights);
 if(!rights||rights.length===0)return fail("공유할 권리기재 후보가 없습니다. 빈 목록은 안전 확인이 아닙니다.",400);
 const issued=body.issuedOn===""?"":validBriefDate(body.issuedOn);
 if(typeof body.issuedOn!=="string"||issued===""&&body.issuedOn!=="")
  return fail("발급일은 정확한 과거 날짜이거나 미입력 상태여야 합니다.",400);
 const dal=getDal();
 const outcome=await dal.withTransaction(async tx=>{
  const listing=await tx.get("SELECT owner_id FROM custom_listings WHERE id=?"+(dal.kind==="pg"?" FOR UPDATE":""),[params.id]);
  if(!listing)return {error:"등록 매물이 없습니다.",status:404};
  if(String(listing.owner_id)!==a.identity.userId)return {error:"등록 계정만 권리요약을 공유할 수 있습니다.",status:403};
  const sharedAt=now();
  await tx.run(
   "INSERT INTO listing_rights_briefs(listing_id,source_kind,issued_on,rights_json,shared_by,shared_at) VALUES(?,?,?,?,?,?)"+
   " ON CONFLICT(listing_id) DO UPDATE SET source_kind=excluded.source_kind,issued_on=excluded.issued_on,"+
   " rights_json=excluded.rights_json,shared_by=excluded.shared_by,shared_at=excluded.shared_at",
   [params.id,BRIEF_SOURCE,issued,JSON.stringify(rights),a.identity.userId,sharedAt]);
  return {sharedAt};
 });
 if("error"in outcome)return fail(outcome.error,outcome.status);
 return ok({available:true,verified:false,source:BRIEF_SOURCE,rightsCount:rights.length,
  sharedAt:outcome.sharedAt,note:"게시자 제공·독립 검증 없음. 현행/말소·소유권·보증금 안전을 확정하지 않습니다."},201);
}
export async function DELETE(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const a=await authenticate(req);if("error"in a)return fail(a.error,a.status);
 const dal=getDal();
 const status=await dal.withTransaction(async tx=>{
  const listing=await tx.get("SELECT owner_id FROM custom_listings WHERE id=?"+(dal.kind==="pg"?" FOR UPDATE":""),[params.id]);
  if(!listing||String(listing.owner_id)!==a.identity.userId)return 403;
  await tx.run("DELETE FROM listing_rights_briefs WHERE listing_id=?",[params.id]);
  return 200;
 });
 if(status!==200)return fail("요약 삭제 권한 없음",status);
 return ok({deleted:true,note:"게시자 공유 권리요약이 삭제되었습니다. 문서 원본은 처음부터 서버에 저장되지 않았습니다."});
}
