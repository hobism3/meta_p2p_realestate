import {guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {answerOwnerAttention} from "@/lib/owner-delegate-service";
import {tryRealJiptok} from "@/lib/real-jiptok-service";
export async function POST(req:Request,{params}:{params:{id:string}}){
 const g=guardWrite(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const parsed=await readJson(req);if("err" in parsed)return parsed.err;
 const answer=parsed.value.answer;
 if(typeof answer!=="string"||!answer.trim()||answer.length>2000)
   return ok({error:"답변은 1~2000자로 입력해주세요"},400);
 try{
  const response=await answerOwnerAttention(params.id,a.identity.userId,a.identity.name,answer);
  if(response)await tryRealJiptok(response.roomId,{kind:"message",
    sourceId:response.messageId,actorId:a.identity.userId});
  return response?ok(response):ok({error:"요청을 찾을 수 없습니다"},404);
 }catch(e){return ok({error:e instanceof Error?e.message:"답변 처리 실패"},409);}
}
