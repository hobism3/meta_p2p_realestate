import {test} from "node:test";
import assert from "node:assert/strict";
import {PENDING_BOOKING_TTL_HOURS,EXPIRED_BY,expirationCutoff,displayBookingStatus,expirePendingBookings} from "../lib/owner-booking-expiry.ts";

test("24시간을 넘긴 승인 대기 예약만 만료 대상으로 표시",()=>{
 assert.equal(PENDING_BOOKING_TTL_HOURS,24);
 assert.equal(expirationCutoff(new Date("2026-11-02T09:30:00.000Z")),"2026-11-01T09:30:00.000Z");
});
test("시스템 만료와 사용자 취소를 구별하고 확정·거절은 유지",()=>{
 assert.equal(displayBookingStatus({status:"cancelled",decided_by:EXPIRED_BY}),"expired");
 assert.equal(displayBookingStatus({status:"cancelled",decided_by:"owner-a"}),"cancelled");
 assert.equal(displayBookingStatus({status:"confirmed",decided_by:EXPIRED_BY}),"confirmed");
 assert.equal(displayBookingStatus({status:"requested",decided_by:""}),"requested");
});

test("비상 READ_ONLY 모드의 GET은 예약 만료를 쓰기 처리하지 않는다",async()=>{
 const old=process.env.READ_ONLY;
 process.env.READ_ONLY="true";
 try{assert.equal(await expirePendingBookings({listingId:"synthetic-not-stored"}),0);}
 finally{if(old===undefined)delete process.env.READ_ONLY;else process.env.READ_ONLY=old;}
});
