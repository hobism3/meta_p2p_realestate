import {test} from "node:test";
import assert from "node:assert/strict";
import {PENDING_BOOKING_TTL_HOURS,EXPIRED_BY,expirationCutoff,displayBookingStatus} from "../lib/owner-booking-expiry.ts";

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
