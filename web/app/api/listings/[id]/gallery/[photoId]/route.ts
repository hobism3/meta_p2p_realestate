import {guardRead,guardWrite,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";

type Ctx={params:{id:string;photoId:string}};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function GET(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 if(!UUID.test(params.photoId))return ok({error:"사진 없음"},404);
 const photo=await getDal().get(
  "SELECT image_base64 FROM listing_gallery_photos WHERE listing_id=? AND id=?",
  [params.id,params.photoId]);
 if(!photo)return ok({error:"사진 없음"},404);
 return new Response(new Uint8Array(Buffer.from(String(photo.image_base64),"base64")),{status:200,headers:{
  "Content-Type":"image/jpeg","Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin",
  "Referrer-Policy":"no-referrer","Content-Disposition":"inline",
 }});
}
export async function DELETE(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const a=await authenticate(req);if("error"in a)return ok({error:a.error},a.status);
 if(!UUID.test(params.photoId))return ok({error:"사진 없음"},404);
 const dal=getDal();
 const result=await dal.withTransaction(async tx=>{
  const owner=await tx.get("SELECT owner_id FROM custom_listings WHERE id=?"+(dal.kind==="pg"?" FOR UPDATE":""),[params.id]);
  if(!owner||String(owner.owner_id)!==a.identity.userId)return 403;
  const row=await tx.get("SELECT id FROM listing_gallery_photos WHERE id=? AND listing_id=?",[params.photoId,params.id]);
  if(!row)return 404;
  await tx.run("DELETE FROM listing_gallery_photos WHERE id=? AND listing_id=?",[params.photoId,params.id]);
  return 200;
 });
 if(result!==200)return ok({error:result===403?"사진 삭제 권한 없음":"사진 없음"},result);
 return ok({deleted:true,note:"게시된 이미지 데이터를 삭제했습니다. 서비스·제3자 캐시가 즉시 삭제되는 것까지 보장하지 않습니다."});
}
