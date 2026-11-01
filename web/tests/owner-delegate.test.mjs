import {test} from "node:test";
import assert from "node:assert/strict";
import {answerOwnerInquiry, ownerVisitWindows} from "../lib/owner-delegate.ts";
import {DEFAULT_OWNER_AI_POLICY} from "../lib/owner-ai.ts";

const listing={tradeType:"월세",deposit:1800,rent:78,salePrice:0,area:49,
 address:"서울시 테스트 구",options:["에어컨","세탁기"],moveIn:"2026-12-01"};
const policy={...DEFAULT_OWNER_AI_POLICY,aiEnabled:true,
 availability:[{weekday:6,start:"13:00",end:"18:00"}],
 answers:{pets:"고양이 가능, 강아지 별도 문의",parking:"1대 가능",notes:"분리수거 안내"}};
test("집주인 등록 사실만 자동 응답",()=>{
 const pet=answerOwnerInquiry("고양이 키워도 되나요?",listing,policy);
 assert.equal(pet.handoff,false);assert.match(pet.response,/고양이 가능/);
 assert.match(answerOwnerInquiry("주차 가능한가요?",listing,policy).response,/1대 가능/);
 assert.match(answerOwnerInquiry("보증금 얼마예요?",listing,policy).response,/1,800만원 \/ 월세 78만원/);
 assert.match(answerOwnerInquiry("면적 몇 평이죠?",listing,policy).response,/49㎡/);
 assert.match(answerOwnerInquiry("기본 옵션 알려줘",listing,policy).response,/에어컨, 세탁기/);
 assert.match(answerOwnerInquiry("언제 입주하나요?",listing,policy).response,/2026-12-01/);
});
test("방문 규칙만 안내, 특정 날짜 예약은 집주인에게",()=>{
 assert.match(ownerVisitWindows(policy),/토요일 13:00~18:00/);
 const windows=answerOwnerInquiry("언제 방문 가능한가요?",listing,policy);
 assert.equal(windows.handoff,false);assert.match(windows.response,/예약은 확정되지 않았습니다/);
 const reserve=answerOwnerInquiry("토요일 오후 3시 방문 예약해 주세요",listing,policy);
 assert.equal(reserve.handoff,true);assert.equal(reserve.kind,"visit_review");
 assert.match(reserve.response,/아직 예약되지 않았습니다/);
});
test("가격 변경·계약 요청은 자동 승낙하지 않음",()=>{
 const price=answerOwnerInquiry("보증금 올리면 월세 깎아주나요?",listing,policy);
 assert.equal(price.handoff,true);assert.equal(price.kind,"price_review");
 const contract=answerOwnerInquiry("계약금 입금해도 되나요?",listing,policy);
 assert.equal(contract.handoff,true);assert.equal(contract.kind,"contract_review");
 assert.doesNotMatch(contract.response,/입금하셔도/);
});
test("등록 정책 없거나 모호하면 확인 요청",()=>{
 const absent={...policy,answers:{...policy.answers,pets:"",parking:""}};
 assert.equal(answerOwnerInquiry("고양이 키워도 되나요?",listing,absent).kind,"policy_review");
 assert.equal(answerOwnerInquiry("층간소음 심한가요?",listing,policy).handoff,true);
});

test("금액을 직접 제안하는 요청은 등록 가격 안내로 덮지 않고 승인 요청",()=>{
  for(const q of ["보증금 3000에 월세 60으로 해주실 수 있나요?", "보증금 5000이면 월세 60 가능해요?"]) {
    const reply=answerOwnerInquiry(q,listing,policy);
    assert.equal(reply.handoff,true,q);
    assert.equal(reply.kind,"price_review",q);
  }
});
