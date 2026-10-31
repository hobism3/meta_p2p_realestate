import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRentSpeech, parseRentFields } from "../lib/rent.ts";
import { analyzeMock } from "../lib/ziptalk-service.ts";
import { brokerSnapshot } from "../lib/broker-companion.ts";

const time = "2026-10-31T08:08:00Z";
const message = (id, author_type, text) => ({ id, author_type, author: author_type === "human" ? "임차인" : "AI 임대인", text, created_at: time });
const condition = (name,value,proposer) => ({name,value,proposer,status:"proposed",confirmedBy:"",confirmedVersion:0});
const priceMap = () => new Map([
  ["임차 희망 조건",condition("임차 희망 조건","보증금 3,000만원/월세 60만원","human")],
  ["임대 제안 조건",condition("임대 제안 조건","보증금 3,000만원/월세 68만원","demo")],
]);

test("한글로 말한 보증금 삼천과 월세 육십팔을 숫자로 정규화", () => {
  assert.deepEqual(parseRentFields("보증금 삼천에 월세 육십팔이면 좋겠어요"),{deposit:3000,monthlyRent:68});
  assert.deepEqual(parseRentFields("보증금 3천, 월세 68"),{deposit:3000,monthlyRent:68});
  assert.deepEqual(parseRentFields("그렇게 하세요"),{deposit:null,monthlyRent:null});
  assert.match(normalizeRentSpeech("보증금 삼천, 월세 육십팔"),/3000만원.*68만원/);
});
test("양측 발화가 가격에 수렴할 때 월세 묶음 합의 후보 생성", () => {
  const t=message("last-ai","demo_agent","테라스와 함께 삼천에 육십팔로 편히 진행해요");
  const h=[t,message("h-agree","human","전 좋아요"),message("old-ai","demo_agent","보증금 삼천에 월세 육십팔이면 좋겠어요")];
  const r=analyzeMock(t,priceMap(),time,h,"월세");
  assert.ok(r.upserts.some((c)=>c.name==="임차 희망 조건" && c.value==="보증금 3,000만원/월세 68만원"));
  const final=r.upserts.find((c)=>c.name==="월세 조건");
  assert.equal(final?.value,"보증금 3,000만원/월세 68만원");
  assert.equal(final?.status,"proposed");
  assert.ok(final?.evidence.includes("h-agree") === false || final?.evidence.includes("old-ai"));
});
test("집이 좋다는 말은 가격 동의가 아니다", () => {
  const t=message("last-ai","demo_agent","테라스 집이 마음에 드셨다니 저도 기분이 좋네요");
  const h=[t,message("h","human","방 보고 왔는데 좋네요"),message("old-ai","demo_agent","보증금 삼천에 월세 육십팔이면 좋겠어요")];
  const r=analyzeMock(t,priceMap(),time,h,"월세");
  assert.ok(!r.upserts.some((c)=>c.name==="월세 조건"));
});
test("AI가 고양이를 허용하면 옵션은 근거 있는 확인 대기 제안", () => {
  const t=message("pet-ai","demo_agent","테라스 있는 집인데 고양이는 조용히 키우시면 괜찮아요");
  const r=analyzeMock(t,new Map(),time,[t],"월세");
  const pet=r.upserts.find((c)=>c.name==="옵션");
  assert.equal(pet?.value,"반려묘 허용(조용히 키우는 조건)");
  assert.deepEqual(pet?.evidence,["pet-ai"]);
  assert.equal(pet?.status,"proposed");
});
test("고양이 질문과 금지는 허용 기록이 되지 않는다", () => {
  const q=message("human","human","고양이 키워도 되나요?");
  const deny=message("deny","demo_agent","고양이는 키우시면 안 됩니다");
  assert.ok(!analyzeMock(q,new Map(),time,[q],"월세").upserts.some((c)=>c.name==="옵션"));
  assert.ok(!analyzeMock(deny,new Map(),time,[deny],"월세").upserts.some((c)=>c.name==="옵션"));
});
test("6단계 진행 안내는 계약·잔금까지 이어진다", () => {
  const p={id:"p1",name:"월세 조건",status:"agreed"};
  const base={tradeType:"월세",conditions:[],visits:[],chat:[],proposals:[p]};
  const progress=brokerSnapshot(base);
  assert.equal(progress.journey.length,6);
  assert.equal(progress.journey[1].status,"checked");
  assert.match(progress.nextStep.title,/계약일/);
  const contract=brokerSnapshot({...base,proposals:[p,{id:"c",name:"계약일",status:"agreed"}]});
  assert.match(contract.nextStep.title,/잔금일/);
});
