import {randomUUID} from "node:crypto";
import {getDal,type Tx} from "./dal.ts";
import {now} from "./db.ts";
import {runOwnerDelegate,type OwnerDelegateResult} from "./owner-delegate-service.ts";
import {getOwnerAiPolicy} from "./owner-ai.ts";
import {tryRealJiptok} from "./real-jiptok-service.ts";

/** A transactional outbox for owner facts and owner-attention handoffs.
 * Cron and HTTP may drain simultaneously; the DB owns claim/lease state.
 */
export type OwnerJobStatus="pending"|"processing"|"completed"|"disabled"|"failed";
type DbJob={
 id:string;room_id:string;listing_id:string;trigger_msg_id:string;caller_id:string;policy_updated_at:string;
 status:OwnerJobStatus;attempts:number;available_at:string;lease_until:string;
 reply_msg_id:string;last_error:string;created_at:string;updated_at:string;
};
const MAX_ATTEMPTS=5;
const LEASE_MS=120_000;
const backoff=(attempts:number)=>Math.min(3600_000,15_000*2**Math.max(0,attempts-1));
const iso=(t:number)=>new Date(t).toISOString();

export async function enqueueOwnerAiForMessage(tx:Tx,input:{
 roomId:string;listingId:string;messageId:string;senderId:string;stamp:string;
}):Promise<boolean>{
 // Read within the same transaction as message insertion: no lost job on crash.
 const listing=await tx.get(
  "SELECT l.owner_id,s.ai_enabled,s.updated_at AS policy_updated_at FROM custom_listings l LEFT JOIN listing_ai_settings s ON s.listing_id=l.id WHERE l.id=?",
  [input.listingId],
 );
 if(!listing||!listing.owner_id||listing.owner_id===input.senderId||Number(listing.ai_enabled)!==1)
  return false;
 const demoAgent=await tx.get("SELECT 1 AS active FROM room_agents WHERE room_id=? LIMIT 1",[input.roomId]);
 if(demoAgent)return false;
 await tx.run(
  "INSERT INTO owner_ai_jobs (id,room_id,listing_id,trigger_msg_id,caller_id,policy_updated_at,status,attempts,available_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending',0,?,?,?) ON CONFLICT(room_id,trigger_msg_id) DO NOTHING",
  [randomUUID(),input.roomId,input.listingId,input.messageId,input.senderId,String(listing.policy_updated_at??""),input.stamp,input.stamp,input.stamp],
 );
 return true;
}
function fromRow(row:Record<string,unknown>):DbJob{
 return {
  id:String(row.id),room_id:String(row.room_id),listing_id:String(row.listing_id),
  trigger_msg_id:String(row.trigger_msg_id),caller_id:String(row.caller_id),policy_updated_at:String(row.policy_updated_at??""),
  status:String(row.status) as OwnerJobStatus,attempts:Number(row.attempts||0),
  available_at:String(row.available_at),lease_until:String(row.lease_until||""),
  reply_msg_id:String(row.reply_msg_id||""),last_error:String(row.last_error||""),
  created_at:String(row.created_at),updated_at:String(row.updated_at),
 };
}
async function claimOne(opts:{roomId?:string;triggerId?:string}):Promise<DbJob|null>{
 const db=getDal();
 const stamp=now(),lease=iso(Date.now()+LEASE_MS);
 return db.withTransaction(async tx=>{
  // No database dialect-specific SKIP LOCKED is required. The conditional
  // UPDATE ... RETURNING is an atomic compare-and-swap on both engines.
  const conditions=["((status='pending' AND available_at<=?) OR (status='processing' AND lease_until<=?))"];
  const params:unknown[]=[stamp,stamp];
  if(opts.roomId){conditions.push("room_id=?");params.push(opts.roomId);}
  if(opts.triggerId){conditions.push("trigger_msg_id=?");params.push(opts.triggerId);}
  const candidates=await tx.all(
   "SELECT id FROM owner_ai_jobs WHERE "+conditions.join(" AND ")+" ORDER BY created_at ASC LIMIT 5",
   params as string[],
  );
  for(const c of candidates){
   const row=await tx.get(
    "UPDATE owner_ai_jobs SET status='processing', attempts=attempts+1, lease_until=?, updated_at=? WHERE id=? AND "+conditions[0]+" RETURNING *",
    [lease,stamp,String(c.id),stamp,stamp],
   );
   if(row)return fromRow(row);
  }
  return null;
 });
}
async function finish(job:DbJob,result:OwnerDelegateResult):Promise<void>{
 const reply=result.messageId??"";
 await getDal().run(
  "UPDATE owner_ai_jobs SET status=?,reply_msg_id=?,completed_at=?,lease_until='',last_error='',updated_at=? WHERE id=? AND status='processing' AND attempts=?",
  [result.outcome==="disabled"?"disabled":"completed",reply,now(),now(),job.id,job.attempts],
 );
 // A duplicate or legacy manual invoke is safe: room-trigger event keys are unique.
 if(result.outcome==="replied"&&result.messageId)
  await tryRealJiptok(job.room_id,{kind:"owner-agent",sourceId:result.messageId,actorId:job.caller_id});
}
async function retryOrFail(job:DbJob,e:unknown):Promise<void>{
 const fatal=job.attempts>=MAX_ATTEMPTS;
 const stamp=now();
 const description=e instanceof Error?e.name:"UnknownError"; // no raw PII in DB
 console.error("[owner-ai-job] failed",{
  jobId:job.id,status:fatal?"failed":"retry",attempts:job.attempts,errorType:description,
 });
 await getDal().run(
  "UPDATE owner_ai_jobs SET status=?, available_at=?, lease_until='', last_error=?, updated_at=? WHERE id=? AND status='processing' AND attempts=?",
  [fatal?"failed":"pending",iso(Date.now()+backoff(job.attempts)),
   fatal?"응대 처리 실패. 집주인 확인 필요.":"자동 재시도 대기 중.",stamp,job.id,job.attempts],
 );
}
export async function drainOwnerAiJobs(options:{limit?:number;roomId?:string;triggerId?:string}={}):
 Promise<{processed:number;completed:number;disabled:number;retrying:number;failed:number}> {
 const limit=Math.max(1,Math.min(10,Math.floor(options.limit??5)));
 const tally={processed:0,completed:0,disabled:0,retrying:0,failed:0};
 for(let i=0;i<limit;i++){
  const job=await claimOne(options);
  if(!job)break;
  tally.processed++;
  try{
   // A queued message must not be answered using a policy the owner changed
   // after the question arrived; pause stale jobs rather than misrepresent
   // an old instruction or a newly disabled agent.
   const policy=await getOwnerAiPolicy(job.listing_id);
   if(!policy.aiEnabled||policy.updatedAt!==job.policy_updated_at){
    await finish(job,{outcome:"disabled",messageId:null,requestId:null});
    tally.disabled++;
    continue;
   }
   const result=await runOwnerDelegate(job.room_id,job.trigger_msg_id,job.caller_id);
   await finish(job,result);
   if(result.outcome==="disabled")tally.disabled++;
   else tally.completed++;
  }catch(e){
   try{await retryOrFail(job,e);}catch(f){
    console.error("[owner-ai-job] failed to record retry",f instanceof Error?f.name:"UnknownError");
   }
   if(job.attempts>=MAX_ATTEMPTS)tally.failed++;
   else tally.retrying++;
  }
 }
 return tally;
}
export async function ownerAiJobStatus(roomId:string):Promise<Array<{
 id:string;trigger_msg_id:string;status:OwnerJobStatus;attempts:number;
 available_at:string;updated_at:string;last_error:string;
}>>{
 const rows=await getDal().all(
  "SELECT id,trigger_msg_id,status,attempts,available_at,updated_at,last_error FROM owner_ai_jobs WHERE room_id=? ORDER BY created_at DESC LIMIT 40",
  [roomId],
 );
 return rows.map(r=>({
  id:String(r.id),trigger_msg_id:String(r.trigger_msg_id),
  status:String(r.status) as OwnerJobStatus,attempts:Number(r.attempts),
  available_at:String(r.available_at),updated_at:String(r.updated_at),
  last_error:String(r.last_error||""),
 }));
}
export async function ownerAiJobFailures(ownerId:string):Promise<Array<{
 id:string;listing_id:string;listing_title:string;room_id:string;
 status:string;updated_at:string;last_error:string;
}>>{
 const rows=await getDal().all(
  "SELECT j.id,j.listing_id,l.title AS listing_title,j.room_id,j.status,j.updated_at,j.last_error FROM owner_ai_jobs j JOIN custom_listings l ON l.id=j.listing_id WHERE l.owner_id=? AND j.status='failed' ORDER BY j.updated_at DESC LIMIT 40",
  [ownerId],
 );
 return rows.map(r=>({
  id:String(r.id),listing_id:String(r.listing_id),listing_title:String(r.listing_title),
  room_id:String(r.room_id),status:String(r.status),updated_at:String(r.updated_at),
  last_error:String(r.last_error||""),
 }));
}

/** Explicit owner retry only after the backoff budget was exhausted. */
export async function retryFailedOwnerAiJob(jobId:string,ownerId:string):
 Promise<{roomId:string;triggerId:string}|null>{
 return getDal().withTransaction(async tx=>{
  const found=await tx.get(
   "SELECT j.room_id,j.trigger_msg_id FROM owner_ai_jobs j JOIN custom_listings l ON l.id=j.listing_id WHERE j.id=? AND l.owner_id=? AND j.status='failed'",
   [jobId,ownerId],
  );
  if(!found)return null;
  const stamp=now();
  const changed=await tx.get(
   "UPDATE owner_ai_jobs SET status='pending',attempts=0,available_at=?,lease_until='',last_error='',updated_at=? WHERE id=? AND status='failed' RETURNING id",
   [stamp,stamp,jobId],
  );
  if(!changed)return null;
  return {roomId:String(found.room_id),triggerId:String(found.trigger_msg_id)};
 });
}
