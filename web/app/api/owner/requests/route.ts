import {guardRead,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {ownerAttentionList} from "@/lib/owner-delegate-service";
export async function GET(req:Request){
 const g=guardRead(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const id=new URL(req.url).searchParams.get("listing_id")||undefined;
 if(id&&id.length>100)return ok({error:"잘못된 매물 ID"},400);
 return ok(await ownerAttentionList(a.identity.userId,id));
}
