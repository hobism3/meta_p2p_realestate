import {guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {runOwnerDelegate} from "@/lib/owner-delegate-service";
export async function POST(req:Request,{params}:{params:{rid:string}}){
 const g=guardWrite(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const parsed=await readJson(req);if("err" in parsed)return parsed.err;
 const id=parsed.value.trigger_message_id;
 if(typeof id!=="string"||!id||id.length>100)return ok({error:"유효한 메시지 ID가 필요합니다"},400);
 try{return ok(await runOwnerDelegate(params.rid,id,a.identity.userId));}
 catch(e){return ok({error:e instanceof Error?e.message:"AI 응대 실패"},403);}
}
