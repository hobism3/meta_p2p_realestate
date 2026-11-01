import {guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {runOwnerDelegate} from "@/lib/owner-delegate-service";
import {tryRealJiptok} from "@/lib/real-jiptok-service";
import {getDal} from "@/lib/dal";
import {getRoom,isRoomMember} from "@/lib/rooms";
import {getOwnerAiPolicy} from "@/lib/owner-ai";
export async function POST(req:Request,{params}:{params:{rid:string}}){
 const g=guardWrite(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const parsed=await readJson(req);if("err" in parsed)return parsed.err;
 const id=parsed.value.trigger_message_id;
 if(typeof id!=="string"||!id||id.length>100)return ok({error:"유효한 메시지 ID가 필요합니다"},400);
 // Legacy clients can read completed results, but cannot bypass the durable
 // queue's retry limits or owner policy-version checks for new messages.
 const room=await getRoom(params.rid);
 if(!room||!await isRoomMember(params.rid,a.identity.userId))return ok({error:"거래방 접근 권한 없음"},403);
 const job=await getDal().get(
  "SELECT status,listing_id,policy_updated_at FROM owner_ai_jobs WHERE room_id=? AND trigger_msg_id=?",
  [params.rid,id],
 );
 if(job){
  const policy=await getOwnerAiPolicy(String(job.listing_id));
  if(job.status==="disabled"||!policy.aiEnabled||policy.updatedAt!==String(job.policy_updated_at))
   return ok({outcome:"disabled",messageId:null,requestId:null});
  if(job.status==="failed")return ok({error:"AI 응대가 반복 실패했습니다. 집주인 확인이 필요합니다."},409);
  if(job.status==="pending"||job.status==="processing")
   return ok({outcome:"queued",messageId:null,requestId:null},202);
 }
 try{
  const result=await runOwnerDelegate(params.rid,id,a.identity.userId);
  if(result.outcome==="replied"&&result.messageId)await tryRealJiptok(params.rid,{
   kind:"owner-agent",sourceId:result.messageId,actorId:a.identity.userId,
  });
  return ok(result);
 }
 catch(e){return ok({error:e instanceof Error?e.message:"AI 응대 실패"},403);}
}
