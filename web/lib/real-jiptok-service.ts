import {randomUUID} from "node:crypto";
import {getDal} from "./dal.ts";
import {now} from "./db.ts";
import {getRoom} from "./rooms.ts";
import {listingForDemo,isDemoListing} from "./demo.ts";
import {readTransactionState} from "./transaction-state-service.ts";
import {createProposals} from "./agreement-service.ts";
import {decideRealJiptok,type RealGuideEvent} from "./real-jiptok-rules.ts";

export type RealJiptokTrigger=
 | {kind:"message";sourceId:string;actorId:string}
 | {kind:"proposal-created";sourceId:string;actorId:string}
 | {kind:"proposal-decided";sourceId:string;actorId:string}
 | {kind:"booking";sourceId:string;actorId:string;status:string};
export type RealJiptokResult={status:"created"|"skipped"|"duplicate";messageId:string|null;proposalId?:string};
/** A failed best-effort note must never roll back an already-saved human message/consent. */
export async function tryRealJiptok(roomId:string,trigger:RealJiptokTrigger):Promise<void> {
 try{await runRealJiptok(roomId,trigger);}
 catch(e){console.warn("[real-jiptok] guidance failure",e instanceof Error?e.name:"unknown");}
}
export async function runRealJiptok(roomId:string,trigger:RealJiptokTrigger):Promise<RealJiptokResult>{
 const db=getDal();
 const room=await getRoom(roomId);
 if(!room)return {status:"skipped",messageId:null};
 const listing=await listingForDemo(room.listing_id);
 if(!listing||isDemoListing(listing))return {status:"skipped",messageId:null};

 // Verify the triggering entity is in the SAME room. Caller routes already
 // authenticate the user, but cross-room IDs must not create any notes.
 let event:RealGuideEvent,proposedCardId:string|undefined;
 let eventKind:string=trigger.kind,eventKey=trigger.sourceId;
 if(trigger.kind==="message"){
  const m=await db.get(
   "SELECT id,text,user_id,author_type FROM messages WHERE id=? AND room_id=?",
   [trigger.sourceId,roomId],
  );
  if(!m||m.author_type!=="human"||m.user_id!==trigger.actorId)
   return {status:"skipped",messageId:null};
  event={kind:"message",text:String(m.text??""),
    isOwner:trigger.actorId===listing.ownerId};
 }else if(trigger.kind==="proposal-created"||trigger.kind==="proposal-decided"){
  const p=await db.get("SELECT id,name,value,status FROM room_proposals WHERE id=? AND room_id=?",
    [trigger.sourceId,roomId]);
  if(!p)return {status:"skipped",messageId:null};
  if(trigger.kind==="proposal-created" && p.status!=="proposed")
    return {status:"skipped",messageId:null};
  if(trigger.kind==="proposal-decided" && p.status!=="agreed" && p.status!=="refused")
    return {status:"skipped",messageId:null};
  event={kind:trigger.kind,name:String(p.name),value:String(p.value),status:String(p.status)};
  if(trigger.kind==="proposal-created")proposedCardId=trigger.sourceId;
  eventKey=trigger.kind==="proposal-decided"?
    `${trigger.sourceId}:${p.status}`:trigger.sourceId;
 }else{
  const b=await db.get("SELECT id,status,visit_date,visit_time FROM owner_visit_bookings WHERE id=? AND room_id=?",
   [trigger.sourceId,roomId]);
  if(!b||b.status!==trigger.status)return {status:"skipped",messageId:null};
  event={kind:"booking",status:trigger.status,date:String(b.visit_date),time:String(b.visit_time)};
  eventKey=`${trigger.sourceId}:${trigger.status}`;
 }
 const snapshot=await readTransactionState(roomId,trigger.actorId);
 if(snapshot.demo)return {status:"skipped",messageId:null};
 let decision=decideRealJiptok(event,snapshot);
 if(!decision.text)return {status:"skipped",messageId:null};

 if(trigger.kind==="message"&&decision.candidate){
  // Propose concrete text ONLY (no automatic consent). This is a normal
  // versioned proposal with its triggering human message as evidence.
  const created=await createProposals(roomId,[{
   name:decision.candidate.name,value:decision.candidate.value,
   evidence:[trigger.sourceId],createdBy:"human",
  }]);
  if(!created[0]?.isNew)return {status:"skipped",messageId:null};
  proposedCardId=created[0].id;
 }
 // Topic notes are deliberately once-per-room to avoid a chatty bot.
 // New price/option proposals and status transitions use an event-specific key.
 if(trigger.kind==="message"&&!proposedCardId){
  eventKind="topic";eventKey=decision.topic;
 }
 const text=decision.text;
 const id=randomUUID(),messageId=randomUUID(),stamp=now();
 return db.withTransaction(async tx=>{
  const inserted=await tx.get(
   "INSERT INTO real_jiptok_events (id,room_id,event_kind,event_key,note_msg_id,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(room_id,event_kind,event_key) DO NOTHING RETURNING id",
   [id,roomId,eventKind,eventKey,messageId,stamp],
  );
  if(!inserted)return {status:"duplicate",messageId:null};
  await tx.run(
   "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
   [messageId,room.listing_id,"집톡이","","agent:"+roomId+":jiptok","assistant",roomId,text,stamp],
  );
  if(proposedCardId)await tx.run(
   "UPDATE room_proposals SET card_msg_id=? WHERE id=? AND room_id=? AND card_msg_id=''",
   [messageId,proposedCardId,roomId],
  );
  return {status:"created",messageId,proposalId:proposedCardId};
 });
}
