import {guardWrite,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {drainOwnerAiJobs,retryFailedOwnerAiJob} from "@/lib/owner-ai-job-service";
export async function POST(req:Request,{params}:{params:{jid:string}}){
 const w=guardWrite(req);if(w)return w;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const job=await retryFailedOwnerAiJob(params.jid,a.identity.userId);
 if(!job)return ok({error:"재시도할 수 없는 작업입니다."},404);
 try{
  const result=await drainOwnerAiJobs({roomId:job.roomId,triggerId:job.triggerId,limit:1});
  return ok({ok:true,result});
 }catch{return ok({error:"작업을 대기열로 되돌렸습니다. 자동 복구가 이어집니다."},202);}
}