import {randomUUID} from "node:crypto";
import {guardRead,guardWrite,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";
import {GALLERY_MAX_PHOTOS,parseBoundedGalleryJson,validateGalleryJpeg,validRoom,galleryImageUrl} from "@/lib/gallery-image";

type Ctx={params:{id:string}};
const fail=(reason:string,status:number)=>ok({error:reason},status);
export async function GET(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 const rows=await getDal().all(
  "SELECT id,room,masked,display_order,created_at FROM listing_gallery_photos WHERE listing_id=? ORDER BY display_order,created_at LIMIT 6",
  [params.id]);
 return ok({photos:rows.map(r=>({
  id:String(r.id),room:String(r.room),masked:Number(r.masked)===1,
  url:galleryImageUrl(params.id,String(r.id)),publishedAt:String(r.created_at),
 })),note:"게시자가 검토 후 공개한 사진입니다. 사진은 매물 상태·권리관계·제공 옵션의 증거가 아닙니다."});
}
export async function POST(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const auth=await authenticate(req);if("error"in auth)return fail(auth.error,auth.status);
 const payload=await parseBoundedGalleryJson(req);
 if(!payload)return fail("사진 요청이 너무 크거나 형식이 올바르지 않습니다.",413);
 if(payload.consentToPublish!==true||payload.checkedPersonalInfo!==true||
    payload.clientReencoded!==true||payload.aiGenerated===true)
  return fail("게시 동의·개인정보 확인·브라우저 JPEG 재변환이 필요합니다.",400);
 const jpeg=validateGalleryJpeg(payload.image);
 if(!jpeg)return fail("게시 사진은 EXIF 없는 작은 JPEG(180KB 이하, 100~1600px)만 지원합니다.",422);
 const room=validRoom(payload.room);
 const dal=getDal();let result:{id:string}|{error:string;status:number};
 result=await dal.withTransaction(async tx=>{
  // Lock custom listing so simultaneous publishes cannot bypass six-photo cap.
  const record=await tx.get(
   "SELECT owner_id FROM custom_listings WHERE id=?"+(dal.kind==="pg"?" FOR UPDATE":""),
   [params.id]);
  if(!record)return {error:"등록된 매물이 없습니다. 가상 매물에는 사진을 게시할 수 없습니다.",status:404};
  if(String(record.owner_id)!==auth.identity.userId)return {error:"이 매물의 등록 계정만 사진을 게시할 수 있습니다.",status:403};
  const count=await tx.get("SELECT COUNT(*) AS n FROM listing_gallery_photos WHERE listing_id=?",[params.id]);
  if(Number(count?.n??0)>=GALLERY_MAX_PHOTOS)return {error:"게시 사진은 매물당 최대 6장입니다.",status:409};
  const duplicate=await tx.get(
   "SELECT id FROM listing_gallery_photos WHERE listing_id=? AND image_sha256=?",
   [params.id,jpeg.sha256]);
  if(duplicate)return {error:"이미 게시된 사진입니다.",status:409};
  const order=await tx.get("SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM listing_gallery_photos WHERE listing_id=?",[params.id]);
  const id=randomUUID();
  await tx.run(
   "INSERT INTO listing_gallery_photos(id,listing_id,image_base64,image_sha256,room,masked,display_order,created_at) VALUES(?,?,?,?,?,?,?,?)",
   [id,params.id,jpeg.base64,jpeg.sha256,room,payload.masked===true?1:0,Number(order?.n??0),now()]);
  return {id};
 });
 if("error"in result)return fail(result.error,result.status);
 return ok({id:result.id,url:galleryImageUrl(params.id,result.id),
  published:true,note:"공개된 게시용 변환 이미지만 저장했습니다. 원본과 AI 가상 이미지는 저장하지 않았습니다."},201);
}
