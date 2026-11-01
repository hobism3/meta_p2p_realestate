import {randomUUID} from "node:crypto";
import {getDal} from "./dal.ts";
import {now} from "./db.ts";
import {getRoom,isRoomMember} from "./rooms.ts";
import {isListingOwner} from "./authz.ts";
import {getOwnerAiPolicy} from "./owner-ai.ts";
import {
  bookingCells,bookingLabel,decideStatus,slotsForDate,
  type BookingStatus,
} from "./owner-booking-rules.ts";

export class BookingError extends Error {
  constructor(public readonly statusCode:number,message:string){super(message);this.name="BookingError";}
}
type DbBooking = {
  id:string;listing_id:string;room_id:string;requester_id:string;
  visit_date:string;visit_time:string;status:BookingStatus;
  created_at:string;updated_at:string;decided_by:string;
};
export type BookingView=DbBooking & {listing_title?:string};
async function context(roomId:string,userId:string){
  const room=await getRoom(roomId);
  if(!room || !await isRoomMember(roomId,userId))throw new BookingError(404,"거래방이 없거나 접근 권한이 없습니다");
  const listing=await getDal().get("SELECT id,owner_id FROM custom_listings WHERE id=?",[room.listing_id]);
  if(!listing || !listing.owner_id)throw new BookingError(404,"실제 등록 매물에만 방문 예약을 신청할 수 있습니다");
  return {room,ownerId:String(listing.owner_id),isOwner:await isListingOwner(room.listing_id,userId)};
}
async function addBookingNotice(tx:{run(sql:string,params?:unknown[]):Promise<void>},
  b:{id:string;listing_id:string;room_id:string;visit_date:string;visit_time:string},
  status:BookingStatus,stamp:string){
  const action=status==="requested"?"신청":status==="confirmed"?"확정":status==="declined"?"거절":"취소";
  const content=`방문 일정 ${action}: ${b.visit_date} ${b.visit_time} (한국 시간) · ${bookingLabel(status)}.`+
    (status==="requested"?" 집주인이 승인하기 전까지 예약이 확정된 것이 아닙니다.":"");
  await tx.run(
    "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [randomUUID(),b.listing_id,"방문 일정 알림","","system:booking","booking_notice",b.room_id,content,stamp],
  );
}
export async function getRoomBookingState(roomId:string,userId:string,date?:string) {
  const {room,isOwner}=await context(roomId,userId);
  const policy=await getOwnerAiPolicy(room.listing_id);
  const bookings=(await getDal().all(
    "SELECT * FROM owner_visit_bookings WHERE room_id=? ORDER BY created_at DESC LIMIT 100",[roomId],
  )) as unknown as DbBooking[];
  let available:string[]=[];
  if(date && policy.visitMode==="approval"){
    const permitted=slotsForDate(policy.availability,date);
    if(permitted.length){
      const locked=await getDal().all(
        "SELECT slot_time FROM owner_visit_slot_locks WHERE listing_id=? AND visit_date=?",
        [room.listing_id,date],
      );
      const locks=new Set(locked.map(x=>String(x.slot_time)));
      available=permitted.filter(t=>{
        const cells=bookingCells(t);
        return !!cells && cells.every(cell=>!locks.has(cell));
      });
    }
  }
  return {bookings,availability:policy.availability,mode:policy.visitMode,isOwner,available,date:date??""};
}
export async function requestOwnerBooking(roomId:string,requesterId:string,date:string,time:string){
  const {room,isOwner}=await context(roomId,requesterId);
  if(isOwner)throw new BookingError(403,"집주인 본인은 방문 신청자가 될 수 없습니다");
  const policy=await getOwnerAiPolicy(room.listing_id);
  if(policy.visitMode!=="approval")throw new BookingError(409,"이 매물은 방문 신청을 직접 관리하고 있습니다");
  const cells=bookingCells(time);
  if(!cells || !slotsForDate(policy.availability,date).includes(time))
    throw new BookingError(400,"등록된 방문 가능 시간 중 미래의 60분 슬롯을 선택해주세요");
  const stamp=now(),id=randomUUID();
  try{
    return await getDal().withTransaction(async tx=>{
      // Settings can change while the visitor is submitting the request.
      const current=await tx.get("SELECT visit_mode,availability_json FROM listing_ai_settings WHERE listing_id=?",[room.listing_id]);
      let windows:typeof policy.availability=[];
      try{windows=JSON.parse(String(current?.availability_json??"[]"));}catch{}
      if(current?.visit_mode!=="approval"||!slotsForDate(windows,date).includes(time))
        throw new BookingError(409,"방문 가능 시간이 변경됐습니다. 새로고침 후 다시 선택해주세요");
      await tx.run(
        "INSERT INTO owner_visit_bookings (id,listing_id,room_id,requester_id,visit_date,visit_time,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [id,room.listing_id,roomId,requesterId,date,time,"requested",stamp,stamp],
      );
      // Both 30-minute cells are UNIQUE for the entire listing, across all rooms.
      for(const cell of cells)await tx.run(
        "INSERT INTO owner_visit_slot_locks (listing_id,visit_date,slot_time,booking_id) VALUES (?,?,?,?)",
        [room.listing_id,date,cell,id],
      );
      await addBookingNotice(tx,{id,listing_id:room.listing_id,room_id:roomId,visit_date:date,visit_time:time},"requested",stamp);
      return {id,status:"requested" as BookingStatus};
    });
  }catch(e){
    if(e instanceof BookingError)throw e;
    if(/unique|duplicate|constraint/i.test(String(e)))throw new BookingError(409,"다른 방문 요청이 이미 선택한 시간과 겹칩니다. 다른 시간을 선택해주세요");
    throw e;
  }
}
export async function changeOwnerBooking(roomId:string,bookingId:string,userId:string,action:string){
  const {isOwner}=await context(roomId,userId);
  return getDal().withTransaction(async tx=>{
    const booking=await tx.get("SELECT * FROM owner_visit_bookings WHERE id=? AND room_id=?",[bookingId,roomId]);
    if(!booking)throw new BookingError(404,"방문 예약을 찾을 수 없습니다");
    const current=String(booking.status) as BookingStatus;
    const next=decideStatus(current,action,isOwner,String(booking.requester_id)===userId);
    if(!next)throw new BookingError(409,"이 상태에서는 변경할 수 없거나 변경 권한이 없습니다");
    const stamp=now();
    // RETURNING guards transitions atomically under competing requests.
    const updated=await tx.get(
      "UPDATE owner_visit_bookings SET status=?,updated_at=?,decided_by=? WHERE id=? AND status=? RETURNING id",
      [next,stamp,userId,bookingId,current],
    );
    if(!updated)throw new BookingError(409,"다른 사람이 먼저 예약 상태를 변경했습니다");
    if(next==="cancelled"||next==="declined")
      await tx.run("DELETE FROM owner_visit_slot_locks WHERE booking_id=?",[bookingId]);
    await addBookingNotice(tx,{
      id:bookingId,listing_id:String(booking.listing_id),room_id:roomId,
      visit_date:String(booking.visit_date),visit_time:String(booking.visit_time),
    },next,stamp);
    return {id:bookingId,status:next};
  });
}
export async function ownerBookings(ownerId:string):Promise<BookingView[]>{
  return (await getDal().all(
    "SELECT b.*,l.title AS listing_title FROM owner_visit_bookings b JOIN custom_listings l ON l.id=b.listing_id WHERE l.owner_id=? ORDER BY CASE WHEN b.status='requested' THEN 0 WHEN b.status='confirmed' THEN 1 ELSE 2 END,b.visit_date ASC,b.visit_time ASC LIMIT 120",
    [ownerId],
  )) as unknown as BookingView[];
}
