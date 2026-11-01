import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {buildTransactionSnapshot} from "../lib/transaction-projection.ts";
import {buildCompanionTasks} from "../lib/jiptok-support-tasks.ts";

const base=()=>({tradeType:"월세",demo:false,proposals:[],conditions:[],bookings:[],visits:[],chat:[]});
describe("집톡이 서포트: DB 스냅샷만 읽고 당사자를 대신 결정하지 않는다",()=>{
 it("방문 승인 대기와 양측 가격 동의 대기를 각각 다음 확인으로 보여준다",()=>{
  const snap=buildTransactionSnapshot({...base(),bookings:[
   {visit_date:"2026-11-05",visit_time:"14:00",status:"requested"},
  ],proposals:[
   {id:"p1",name:"월세 조건",value:"보증금 3000만원 / 월세 70만원",status:"proposed",version:1},
  ]});
  const tasks=buildCompanionTasks(snap);
  assert.ok(tasks.some(t=>t.id==="pending-visit"&&t.title.includes("집주인 승인")));
  assert.ok(tasks.some(t=>t.id==="pending-price"&&t.title.includes("양측 확인")));
  assert.ok(tasks.some(t=>t.id==="registry-rights"&&t.target==="/registry/check"));
  assert.equal(snap.stages.find(s=>s.key==="price").status,"pending");
 });
 it("방문 확정 스냅샷에는 재승인을 요구하지 않는다",()=>{
  const snap=buildTransactionSnapshot({...base(),bookings:[
   {visit_date:"2026-11-05",visit_time:"14:00",status:"confirmed"},
  ]});
  const tasks=buildCompanionTasks(snap);
  assert.equal(tasks.some(t=>t.id==="pending-visit"),false);
  assert.equal(tasks.some(t=>t.kind==="next_check"),true);
 });
 it("기존 합의 뒤 변경제안이 있으면 새로운 동의 대기만 안내한다",()=>{
  const snap=buildTransactionSnapshot({...base(),proposals:[
   {id:"p1",name:"월세 조건",value:"3000/70",status:"agreed",version:1},
   {id:"p2",name:"월세 조건",value:"4000/65",status:"proposed",version:2},
  ]});
  const tasks=buildCompanionTasks(snap);
  assert.ok(tasks.some(t=>t.id==="pending-price"));
  assert.ok(tasks.every(t=>!/70만원이 더 좋|절충|협상하세요|추천가격/.test(t.description)));
 });
 it("완료 수가 높아져도 별도 등기·계약권한 검토를 생략하지 않는다",()=>{
  const names=["월세 조건","계약일","계약금","잔금일","입주일"];
  const snap=buildTransactionSnapshot({...base(),proposals:names.map((name,i)=>({
   id:"p"+i,name,value:"2026-11-30",status:"agreed",version:1,
  }))});
  const tasks=buildCompanionTasks(snap);
  assert.ok(tasks.some(t=>t.id==="registry-rights"));
 });
 it("최대 표시 수는 제한하고 UI는 권리조회/조건확인 링크만 제공한다",()=>{
  const snap=buildTransactionSnapshot({...base(),proposals:[
   "월세 조건","관리비","계약일","계약금","잔금일","입주일",
  ].map((name,i)=>({id:String(i),name,value:"미정",status:"proposed",version:1}))});
  const tasks=buildCompanionTasks(snap,3);
  assert.equal(tasks.length,3);
  assert.equal(tasks.filter(t=>t.kind==="pending_confirmation").length,2);
  assert.equal(tasks[2].id,"registry-rights");
  assert.ok(tasks.every(t=>!t.target||t.target==="/registry/check"||t.target==="#deal-condition-cards"));
 });
});
