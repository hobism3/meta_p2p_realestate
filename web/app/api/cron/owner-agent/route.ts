import {timingSafeEqual} from "node:crypto";
import {drainOwnerAiJobs} from "@/lib/owner-ai-job-service";

export const dynamic="force-dynamic";
export const maxDuration=60;
function authorized(req:Request):boolean{
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<16)return false;
 const supplied=req.headers.get("authorization")??"";
 const expected="Bearer "+secret;
 const a=Buffer.from(supplied),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
/** Vercel Cron sends Authorization: Bearer CRON_SECRET; fail closed when unset. */
export async function GET(req:Request):Promise<Response>{
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<16)return Response.json({error:"작업 복구 인증 미설정"},{status:503,headers:{"Cache-Control":"no-store"}});
 if(!authorized(req))return Response.json({error:"권한 없음"},{status:401,headers:{"Cache-Control":"no-store"}});
 try{
  const report=await drainOwnerAiJobs({limit:10});
  return Response.json({ok:true,...report},{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  console.error("[owner-ai-cron] failed",e instanceof Error?e.name:"UnknownError");
  return Response.json({error:"복구 처리 실패"},{status:500,headers:{"Cache-Control":"no-store"}});
 }
}