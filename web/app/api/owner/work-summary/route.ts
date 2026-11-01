import {guardRead,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {ownerBookings} from "@/lib/owner-booking-service";
import {ownerAttentionList} from "@/lib/owner-delegate-service";
import {ownerAiJobFailures} from "@/lib/owner-ai-job-service";

export async function GET(req:Request){
 const guard=guardRead(req);if(guard)return guard;
 const auth=await authenticate(req);if("error" in auth)return ok({error:auth.error},auth.status);
 const ownerId=auth.identity.userId;
 // Each existing service constrains results to owner_id; never aggregate across tenants.
 const [bookings,requests,failures]=await Promise.all([
  ownerBookings(ownerId),ownerAttentionList(ownerId),ownerAiJobFailures(ownerId),
 ]);
 const requested=bookings.filter(b=>b.status==="requested");
 const pending=requests.filter(r=>r.status==="pending");
 const byListing=new Map<string,{listingId:string;listingTitle:string;visits:number;requests:number;aiFailures:number;visitRoomId?:string;requestRoomId?:string;failedRoomId?:string}>();
 const ensure=(id:string,title:string)=>{
  let row=byListing.get(id);
  if(!row){row={listingId:id,listingTitle:title,visits:0,requests:0,aiFailures:0};byListing.set(id,row);}
  return row;
 };
 for(const b of requested){const row=ensure(String(b.listing_id),String(b.listing_title));row.visits++;row.visitRoomId??=String(b.room_id);}
 for(const r of pending){const row=ensure(String(r.listing_id),String(r.listing_title));row.requests++;row.requestRoomId??=String(r.room_id);}
 for(const f of failures){const row=ensure(String(f.listing_id),String(f.listing_title));row.aiFailures++;row.failedRoomId??=String(f.room_id);}
 const actions=[
  ...requested.map(b=>({id:String(b.id),kind:"visit" as const,listingId:String(b.listing_id),listingTitle:String(b.listing_title),roomId:String(b.room_id),label:`방문 승인 대기 · ${String(b.visit_date)} ${String(b.visit_time)}`})),
  ...pending.map(r=>({id:String(r.id),kind:"request" as const,listingId:String(r.listing_id),listingTitle:String(r.listing_title),roomId:String(r.room_id),label:"집주인 직접 답변 필요"})),
  ...failures.map(j=>({id:String(j.id),kind:"failed" as const,listingId:String(j.listing_id),listingTitle:String(j.listing_title),roomId:String(j.room_id),label:"AI 자동 응대 실패"})),
 ];
 return ok({actions,total:requested.length+pending.length+failures.length,
  visits:requested.length,requests:pending.length,aiFailures:failures.length,
  byListing:Array.from(byListing.values()).sort((a,b)=>(b.visits+b.requests+b.aiFailures)-(a.visits+a.requests+a.aiFailures)),
  note:"예약 최대 120건, 문의 최대 100건, AI 실패 최대 40건의 현재 조회 결과입니다. 전체 누적 통계는 아닙니다."
 });
}
