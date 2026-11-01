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
 const byListing=new Map<string,{listingId:string;listingTitle:string;visits:number;requests:number;aiFailures:number}>();
 const ensure=(id:string,title:string)=>{
  let row=byListing.get(id);
  if(!row){row={listingId:id,listingTitle:title,visits:0,requests:0,aiFailures:0};byListing.set(id,row);}
  return row;
 };
 for(const b of requested)ensure(String(b.listing_id),String(b.listing_title)).visits++;
 for(const r of pending)ensure(String(r.listing_id),String(r.listing_title)).requests++;
 for(const f of failures)ensure(String(f.listing_id),String(f.listing_title)).aiFailures++;
 return ok({total:requested.length+pending.length+failures.length,
  visits:requested.length,requests:pending.length,aiFailures:failures.length,
  byListing:Array.from(byListing.values()).sort((a,b)=>(b.visits+b.requests+b.aiFailures)-(a.visits+a.requests+a.aiFailures)),
  note:"AI 실패 목록은 최근 최대 40건이며, 집계는 화면에 표시할 업무의 수입니다."
 });
}
