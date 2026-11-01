import {getDal} from "./dal.ts";
import {SEED_LISTINGS} from "./listings.ts";
import {getRoomBookingState} from "./owner-booking-service.ts";
import {getProposals} from "./agreement-service.ts";
import {buildTransactionSnapshot,type RawCondition,type RawVisit,type TransactionSnapshot} from "./transaction-projection.ts";

function ids(value:unknown):string[]{
 try{
  const decoded=typeof value==="string"?JSON.parse(value):value;
  return Array.isArray(decoded)?decoded.filter((v):v is string=>typeof v==="string"):[];
 }catch{return [];}
}
/**
 * Called ONLY AFTER room-member auth in route; owner-booking-service verifies
 * room membership again when obtaining actual reservation records.
 */
export async function readTransactionState(roomId:string,userId:string):Promise<TransactionSnapshot>{
 const dal=getDal();
 const room=await dal.get("SELECT listing_id FROM deal_rooms WHERE id=?",[roomId]);
 if(!room)throw Error("거래방 없음");
 const listingId=String(room.listing_id);
 const seed=SEED_LISTINGS.find(x=>x.id===listingId);
 const actual=seed?null:await dal.get("SELECT owner_id,trade_type FROM custom_listings WHERE id=?",[listingId]);
 if(!seed&&!actual)throw Error("매물 없음");
 const demo=!!seed||!String(actual?.owner_id??"");
 const tradeType=seed?.tradeType??String(actual?.trade_type??"월세");
 const [proposed,conditions,chat,visits,bookingState]=await Promise.all([
  getProposals(roomId),
  dal.all("SELECT name,value,source_msg_ids FROM room_conditions WHERE room_id=?",[roomId]),
  dal.all("SELECT author_type,text FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT 100",[roomId]),
  demo?dal.all("SELECT status,visit_date,visit_time,created_at FROM visits WHERE room_id=?",[roomId]):Promise.resolve([]),
  demo?Promise.resolve(null):getRoomBookingState(roomId,userId),
 ]);
 return buildTransactionSnapshot({
  tradeType,demo,proposals:proposed.proposals,
  conditions:conditions.map(c=>({name:String(c.name),value:String(c.value??""),source_msg_ids:ids(c.source_msg_ids)})) as RawCondition[],
  chat:chat.map(m=>({text:String(m.text??""),author_type:String(m.author_type??"")})),
  visits:visits.map(v=>({visit_date:String(v.visit_date),visit_time:String(v.visit_time),
     status:String(v.status),created_at:String(v.created_at??"")})) as RawVisit[],
  bookings:(bookingState?.bookings??[]).map(b=>({visit_date:b.visit_date,visit_time:b.visit_time,
     status:b.status,created_at:b.created_at})),
 });
}
