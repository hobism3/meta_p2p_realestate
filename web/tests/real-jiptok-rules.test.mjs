import {test} from "node:test";
import assert from "node:assert/strict";
import {buildTransactionSnapshot} from "../lib/transaction-projection.ts";
import {decideRealJiptok,extractRealProposal} from "../lib/real-jiptok-rules.ts";
const blank=(tradeType="월세")=>buildTransactionSnapshot({
 tradeType,demo:false,proposals:[],conditions:[],bookings:[],visits:[],chat:[],
});
test("구체적인 월세 제안은 보증금+월세 단일 확인 카드, 자동 합의 아님",()=>{
 const result=extractRealProposal("보증금 3,000만원 / 월세 68만원이면 괜찮습니다.","월세",true);
 assert.deepEqual(result,{name:"월세 조건",value:"보증금 3,000만원/월세 68만원"});
 const d=decideRealJiptok({kind:"message",isOwner:true,
  text:"보증금 3,000만원 / 월세 68만원이면 괜찮습니다."},blank());
 assert.deepEqual(d.candidate,result);
 assert.match(d.text,/두 분이 각각 확인/);
 assert.doesNotMatch(d.text,/확정됐|합의됐/);
});
test("가격 질문·부정·부분 금액은 제안 카드로 생성되지 않음",()=>{
 for(const text of [
  "보증금 3,000만원에 월세 60만원 되나요?",
  "보증금 3,000만원 월세 60만원은 안 됩니다.",
  "월세 70만원이면 좋겠습니다.",
  "보증금 4,000만원으로 해주세요?",
 ]){
  assert.equal(extractRealProposal(text,"월세",false),null,text);
 }
});
test("반려동물에 대한 집주인의 명시적 허용은 제안 카드 후보지만 확정은 아님",()=>{
 const owner=extractRealProposal("고양이 한 마리는 키워도 괜찮습니다.","월세",true);
 assert.deepEqual(owner,{name:"옵션",value:"고양이 한 마리 허용"});
 assert.equal(extractRealProposal("고양이 한 마리 키웁니다.","월세",false),null);
 assert.equal(extractRealProposal("고양이는 안 됩니다.","월세",true),null);
 const question=decideRealJiptok({kind:"message",text:"고양이 키워도 되나요?",isOwner:false},blank());
 assert.equal(question.topic,"pet-questions");
 assert.match(question.text,/양측|두 분|확인 카드/);
});
test("매매·전세도 거래 유형 별 가격 제안 필드가 다름",()=>{
 const jeonse=extractRealProposal("전세보증금 2억 괜찮습니다.","전세",true);
 assert.deepEqual(jeonse,{name:"최종 전세보증금",value:"전세보증금 20,000만원"});
 const sale=extractRealProposal("매매가 5억원에 가능합니다.","매매",true);
 assert.equal(sale?.name,"최종 매매가");
 assert.ok(sale?.value.includes("50,000"));
});
test("방문 승인 이후에만 완료된 일정으로 안내, 취소는 재신청 안내",()=>{
 assert.equal(decideRealJiptok({kind:"booking",date:"2026-11-07",time:"15:00",status:"requested"},blank()).text,null);
 const yes=decideRealJiptok({kind:"booking",date:"2026-11-07",time:"15:00",status:"confirmed"},blank());
 assert.match(yes.text,/집주인 승인/);
 const no=decideRealJiptok({kind:"booking",date:"2026-11-07",time:"15:00",status:"declined"},blank());
 assert.match(no.text,/취소되거나 거절/);
});
test("제안 생성은 대기 안내, 두 사람 동의 이후 계약 프로세스 권유",()=>{
 const s=blank();
 assert.match(decideRealJiptok({kind:"proposal-created",name:"월세 조건",value:"보증금 3000/월세 68",status:"proposed"},s).text,/두 분 모두/);
 const pending=decideRealJiptok({kind:"proposal-decided",name:"월세 조건",value:"보증금 3000/월세 68",status:"proposed"},s);
 assert.equal(pending.text,null);
 const agreed=decideRealJiptok({kind:"proposal-decided",name:"월세 조건",value:"보증금 3000/월세 68",status:"agreed"},s);
 assert.match(agreed.text,/두 분 모두 동의/);
 assert.doesNotMatch(agreed.text,/계약이 체결됐/);
});
test("시연방은 실거래 집톡이 엔진에서 제외",()=>{
 const d=buildTransactionSnapshot({tradeType:"월세",demo:true,proposals:[],conditions:[],bookings:[],visits:[],chat:[]});
 assert.equal(decideRealJiptok({kind:"message",text:"고양이",isOwner:false},d).text,null);
});

test("AI 대리인이 집주인의 명시 정책을 답하면 카드 후보만 제시",()=>{
 const note=decideRealJiptok({
  kind:"owner-agent",text:"집주인 설정에 따라 고양이 두 마리 가능",isOwner:true,
 },blank());
 assert.deepEqual(note.candidate,{name:"옵션",value:"고양이 두 마리 허용"});
 assert.match(note.text,/AI 대리인/);
 assert.match(note.text,/두 분이 직접/);
 assert.equal(decideRealJiptok({kind:"owner-agent",text:"주차 1대 가능",isOwner:true},blank()).text,null);
});
