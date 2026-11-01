import {guardRead,guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {BookingError,getRoomBookingState,requestOwnerBooking} from "@/lib/owner-booking-service";
const failure=(e:unknown)=>e instanceof BookingError?ok({error:e.message},e.statusCode):ok({error:"방문 예약 처리 실패"},500);
export async function GET(req:Request,{params}:{params:{rid:string}}){
 const g=guardRead(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const date=new URL(req.url).searchParams.get("date")??undefined;
 if(date && (date.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(date)))return ok({error:"날짜 형식 오류"},400);
 try{return ok(await getRoomBookingState(params.rid,a.identity.userId,date));}catch(e){return failure(e);}
}
export async function POST(req:Request,{params}:{params:{rid:string}}){
 const g=guardWrite(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const body=await readJson(req);if("err" in body)return body.err;
 const date=body.value.date, time=body.value.time;
 if(typeof date!=="string"||typeof time!=="string")return ok({error:"날짜와 시간을 지정해주세요"},400);
 try{return ok(await requestOwnerBooking(params.rid,a.identity.userId,date,time),201);}
 catch(e){return failure(e);}
}
