import { randomUUID } from "node:crypto";
import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { getOwnerAiPolicy } from "./owner-ai.ts";
import { answerOwnerInquiry, type DelegateListing } from "./owner-delegate.ts";
import { getRoom,isRoomMember } from "./rooms.ts";
import { isListingOwner } from "./authz.ts";

export type OwnerDelegateResult =
 | { outcome:"disabled"; messageId:null; requestId:null }
 | { outcome:"replied"|"handoff"; messageId:string; requestId:string|null };

/** Only original tenant-side human messages can invoke the owner's assistant.
 * Owner answers, housekeeper notes and other AI messages cannot chain-call it. */
export async function runOwnerDelegate(roomId:string, triggerId:string, callerId:string):Promise<OwnerDelegateResult>{
  const room=await getRoom(roomId);
  if(!room || !(await isRoomMember(roomId,callerId))) throw Error("거래방 접근 권한 없음");
  const row=await getDal().get("SELECT * FROM custom_listings WHERE id = ?",[room.listing_id]);
  if(!row || !row.owner_id) return {outcome:"disabled",messageId:null,requestId:null};
  if(await isListingOwner(room.listing_id,callerId)) throw Error("집주인 메시지에는 AI 응대하지 않습니다");
  const trigger=await getDal().get(
    "SELECT id,text,user_id,author_type FROM messages WHERE id = ? AND room_id = ?",
    [triggerId,roomId],
  );
  if(!trigger || trigger.author_type!=="human" || trigger.user_id!==callerId)
    throw Error("해당 메시지를 응대한 권한이 없습니다");
  const policy=await getOwnerAiPolicy(room.listing_id);
  if(!policy.aiEnabled) return {outcome:"disabled",messageId:null,requestId:null};
  const listing:DelegateListing={
    tradeType:String(row.trade_type??""),deposit:Number(row.deposit??0),rent:Number(row.rent??0),
    salePrice:Number(row.sale_price??0),area:Number(row.area??0),address:String(row.address??""),
    moveIn:String(row.move_in??""),options:JSON.parse(String(row.options_json??"[]")) as string[],
  };
  const decision=answerOwnerInquiry(String(trigger.text??""),listing,policy);
  const stamp=now();
  const runId=randomUUID(),replyId=randomUUID(),requestId=decision.handoff?randomUUID():null;
  return getDal().withTransaction(async tx=>{
    const existing=await tx.get("SELECT reply_msg_id FROM owner_ai_runs WHERE room_id = ? AND trigger_msg_id = ?",[roomId,triggerId]);
    if(existing){
      const request=await tx.get("SELECT id FROM owner_ai_requests WHERE room_id = ? AND trigger_msg_id = ?",[roomId,triggerId]);
      return {outcome:request?"handoff":"replied",messageId:String(existing.reply_msg_id),requestId:request?String(request.id):null};
    }
    // Recheck under the same transaction: disabling the policy must stop new output.
    const enabled=await tx.get("SELECT ai_enabled FROM listing_ai_settings WHERE listing_id = ?",[room.listing_id]);
    if(!enabled || Number(enabled.ai_enabled)!==1)return {outcome:"disabled",messageId:null,requestId:null};
    await tx.run(
      "INSERT INTO owner_ai_runs (id,room_id,trigger_msg_id,reply_msg_id,created_at) VALUES (?,?,?,?,?)",
      [runId,roomId,triggerId,replyId,stamp],
    );
    await tx.run(
      "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [replyId,room.listing_id,"AI 집주인 대리인","","agent:"+roomId+":owner", "owner_agent",roomId,decision.response,stamp],
    );
    if(requestId){
      await tx.run(
        "INSERT INTO owner_ai_requests (id,listing_id,room_id,trigger_msg_id,kind,question,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [requestId,room.listing_id,roomId,triggerId,decision.kind,String(trigger.text), "pending",stamp],
      );
    }
    return {outcome:decision.handoff?"handoff":"replied",messageId:replyId,requestId};
  });
}

export type OwnerAttention = {
 id:string;listing_id:string;listing_title:string;room_id:string;
 kind:string;question:string;status:string;created_at:string;answered_at:string;
};
export async function ownerAttentionList(ownerId:string,listingId?:string):Promise<OwnerAttention[]>{
  const base="SELECT a.*,l.title AS listing_title FROM owner_ai_requests a JOIN custom_listings l ON l.id = a.listing_id WHERE l.owner_id = ? ";
  const params=listingId?[ownerId,listingId]:[ownerId];
  const sql=base+(listingId?"AND l.id = ? ":"")+"ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END, a.created_at DESC LIMIT 100";
  return (await getDal().all(sql,params)) as unknown as OwnerAttention[];
}
export async function answerOwnerAttention(id:string, ownerId:string,author:string,text:string):Promise<{roomId:string;messageId:string}|null>{
  const clean=text.trim();
  if(!clean || clean.length>2000) throw Error("답변은 1~2000자로 작성해주세요");
  return getDal().withTransaction(async tx=>{
    const req=await tx.get(
      "SELECT a.*,l.owner_id FROM owner_ai_requests a JOIN custom_listings l ON l.id=a.listing_id WHERE a.id=?",
      [id],
    );
    if(!req || req.owner_id!==ownerId) return null;
    if(req.status!=="pending")throw Error("이미 답변이 처리된 요청입니다");
    const messageId=randomUUID(),stamp=now();
    await tx.run(
      "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [messageId,String(req.listing_id),author,"landlord",ownerId,"human",String(req.room_id),clean,stamp],
    );
    await tx.run(
      "UPDATE owner_ai_requests SET status='answered',response_msg_id=?,answered_at=? WHERE id=?",
      [messageId,stamp,id],
    );
    return {roomId:String(req.room_id),messageId};
  });
}
