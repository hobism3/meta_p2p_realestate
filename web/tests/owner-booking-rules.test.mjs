import {test} from "node:test";
import assert from "node:assert/strict";
import {localKorea,validDate,isBookableDate,slotsForDate,bookingCells,decideStatus} from "../lib/owner-booking-rules.ts";

const now=new Date("2026-11-01T00:00:00Z"); // KST Sunday 09:00
const availability=[{weekday:6,start:"13:00",end:"18:00"}];
test("Asia/Seoul civil time and invalid calendar days",()=>{
 assert.deepEqual(localKorea(now),{date:"2026-11-01",minute:540});
 assert.equal(validDate("2026-02-30"),false);
 assert.equal(validDate("2026-11-07"),true);
 assert.equal(isBookableDate("2026-11-07",now),true);
 assert.equal(isBookableDate("2027-03-15",now),false);
 assert.equal(isBookableDate("2026-10-31",now),false);
});
test("요일별 60분 예약 슬랏은 30분 그리드로 발행",()=>{
 const slots=slotsForDate(availability,"2026-11-07",now);
 assert.equal(slots[0],"13:00");
 assert.equal(slots.at(-1),"17:00");
 assert.equal(slots.includes("17:30"),false);
 assert.equal(slots.includes("13:30"),true);
 assert.deepEqual(slotsForDate(availability,"2026-11-08",now),[]);
});
test("겹치는 시간은 두 개의 30분 세포로 공유해 충돌 감지",()=>{
 assert.deepEqual(bookingCells("13:00"),["13:00","13:30"]);
 assert.deepEqual(bookingCells("13:30"),["13:30","14:00"]);
 assert.equal(bookingCells("13:15"),null);
 assert.equal(bookingCells("24:00"),null);
});
test("집주인만 확정/거절, 신청자 또는 집주인만 취소",()=>{
 assert.equal(decideStatus("requested","confirm",false,true),null);
 assert.equal(decideStatus("requested","confirm",true,false),"confirmed");
 assert.equal(decideStatus("requested","decline",true,false),"declined");
 assert.equal(decideStatus("confirmed","decline",true,false),null);
 assert.equal(decideStatus("confirmed","cancel",false,true),"cancelled");
 assert.equal(decideStatus("declined","cancel",true,false),null);
});
