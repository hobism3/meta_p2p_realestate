import {guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {BookingError,changeOwnerBooking} from "@/lib/owner-booking-service";
import {tryRealJiptok} from "@/lib/real-jiptok-service";
export async function PATCH(req:Request,{params}:{params:{rid:string;bid:string}}){
 const g=guardWrite(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const body=await readJson(req);if("err" in body)return body.err;
 const action=body.value.action;
 if(action!=="confirm"&&action!=="decline"&&action!=="cancel")return ok({error:"예약 처리 동작 오류"},400);
 try{
  const result=await changeOwnerBooking(params.rid,params.bid,a.identity.userId,action);
  await tryRealJiptok(params.rid,{kind:"booking",sourceId:params.bid,
    actorId:a.identity.userId,status:result.status});
  return ok(result);
 }
 catch(e){return e instanceof BookingError?ok({error:e.message},e.statusCode):ok({error:"방문 예약 변경 실패"},500);}
}
