import {test} from "node:test";
import assert from "node:assert/strict";
import {buildTransactionSnapshot} from "../lib/transaction-projection.ts";

const base=()=>({tradeType:"월세",demo:false,proposals:[],conditions:[],bookings:[],visits:[],chat:[]});
const pick=(s,key)=>s.stages.find(v=>v.key===key);
test("실거래 예약은 owner_visit_bookings의 승인만 확정, 시연 방문 수락 무시",()=>{
 const a=buildTransactionSnapshot({...base(),visits:[{visit_date:"2026-11-07",visit_time:"15:00",status:"수락됨"}]});
 assert.equal(pick(a,"visit").status,"not-started");
 const waiting=buildTransactionSnapshot({...base(),bookings:[{visit_date:"2026-11-07",visit_time:"15:00",status:"requested"}]});
 assert.equal(pick(waiting,"visit").status,"pending");
 assert.equal(pick(waiting,"visit").confirmedValue,null);
 const approved=buildTransactionSnapshot({...base(),bookings:[{visit_date:"2026-11-07",visit_time:"15:00",status:"confirmed"}]});
 assert.equal(pick(approved,"visit").status,"confirmed");
 assert.match(pick(approved,"visit").confirmedValue,/15:00/);
});
test("가격은 채팅 내용이나 room_conditions만으로 확정하지 않음",()=>{
 const a=buildTransactionSnapshot({...base(),
  conditions:[{name:"월세 조건",value:"보증금 3000 / 월세 68"}],
  chat:[{text:"그 가격 괜찮습니다",author_type:"human"}]});
 assert.equal(pick(a,"price").confirmedValue,null);
 assert.equal(pick(a,"price").status,"discussing");
 const b=buildTransactionSnapshot({...base(),proposals:[{
   id:"p1",name:"월세 조건",value:"보증금 3000 / 월세 68",version:1,status:"proposed",source_msg_ids:["m1"],
 }]});
 assert.equal(pick(b,"price").status,"pending");
 assert.equal(pick(b,"price").pendingValue,"보증금 3000 / 월세 68");
 assert.deepEqual(pick(b,"price").evidence,["m1"]);
});
test("기존 확정 금액과 새로운 변경 제안을 정확히 분리",()=>{
 const a=buildTransactionSnapshot({...base(),proposals:[
  {id:"p1",name:"월세 조건",value:"보증금 3000 / 월세 68",version:1,status:"agreed"},
  {id:"p2",name:"월세 조건",value:"보증금 4000 / 월세 65",version:2,status:"proposed"},
 ]});
 const price=pick(a,"price");
 assert.equal(price.status,"pending");
 assert.equal(price.confirmedValue,"보증금 3000 / 월세 68");
 assert.equal(price.pendingValue,"보증금 4000 / 월세 65");
});
test("고양이 허용 대화는 생활 조건 확정이 아님; 옵션 합의는 일부 완료",()=>{
 const x=buildTransactionSnapshot({...base(),chat:[{text:"고양이 키우셔도 괜찮아요",author_type:"human"}]});
 assert.equal(pick(x,"living").status,"discussing");
 assert.equal(pick(x,"living").confirmedValue,null);
 const y=buildTransactionSnapshot({...base(),proposals:[
  {id:"opt1",name:"옵션",value:"고양이 한 마리 허용",version:1,status:"agreed"},
 ]});
 assert.equal(pick(y,"living").status,"partial");
 assert.match(pick(y,"living").confirmedValue,/고양이/);
});
test("잔금과 입주일이 각각 확정되어야 마지막 단계 완료",()=>{
 const partial=buildTransactionSnapshot({...base(),proposals:[
  {id:"bal",name:"잔금일",value:"2026-12-01",version:1,status:"agreed"},
 ]});
 assert.equal(pick(partial,"handover").status,"partial");
 const complete=buildTransactionSnapshot({...base(),proposals:[
  {id:"bal",name:"잔금일",value:"2026-12-01",version:1,status:"agreed"},
  {id:"in",name:"입주일",value:"2026-12-01",version:1,status:"agreed"},
 ]});
 assert.equal(pick(complete,"handover").status,"confirmed");
});
test("데모 방문은 시연 수락으로만 표시하고 실제 예약이라고 단정하지 않음",()=>{
 const d=buildTransactionSnapshot({...base(),demo:true,
   visits:[{visit_date:"2026-11-07",visit_time:"15:00",status:"수락됨"}]});
 assert.equal(pick(d,"visit").status,"confirmed");
 assert.match(pick(d,"visit").detail,/시연/);
});
