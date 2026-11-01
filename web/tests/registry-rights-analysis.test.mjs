import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {REVIEW_AGE_REMINDER_DAYS,reviewRegistryRights} from "../lib/registry-rights-analysis.ts";

const base=()=>({issuedOn:"2026-11-01",asOfDate:"2026-11-01",rights:[]});
const entry=(overrides={})=>({
 id:"m1",kind:"mortgage",section:"을구",status:"active",
 claimMaximumManwon:12000,registrationDate:"2026-06-01",rankNumber:1,...overrides,
});
describe("등기 권리관계 구조화 분석은 사용자 입력의 한계만 안내한다",()=>{
 it("아무것도 입력하지 않았다면 안전판정이 아니라 미확인 항목을 안내",()=>{
  const r=reviewRegistryRights(base());
  assert.equal(r.activeMortgageCount,0);
  assert.equal(r.activeMortgageMaximumManwon,null);
  assert.ok(r.findings.some(f=>f.id==="unread-rights"));
  assert.equal(r.checkedItems,0);
  assert.equal(r.totalCheckItems,4);
  assert.equal(r.findings.some(f=>/안전한 매물|위험 없음|합격/.test(f.title)),false);
 });
 it("발급 7일 초과 알림은 법정 유효기간이라고 부르지 않는다",()=>{
  const r=reviewRegistryRights({...base(),asOfDate:"2026-11-10"});
  assert.equal(REVIEW_AGE_REMINDER_DAYS,7);
  const msg=r.findings.find(x=>x.id==="document-age");
  assert.ok(msg);
  assert.match(msg.detail,/법정 유효기간이 아닙니다/);
  const fresh=reviewRegistryRights({...base(),asOfDate:"2026-11-07"});
  assert.equal(fresh.findings.some(x=>x.id==="document-age"),false);
 });
 it("잘못된 날짜·미래 날짜는 발급일 재확인",()=>{
  for(const date of ["","2026-02-30","2026-12-01"]){
   const r=reviewRegistryRights({...base(),issuedOn:date});
   assert.ok(r.findings.some(x=>x.id==="document-date"),date);
  }
 });
 it("현행 근저당만 채권최고액 합산, 말소 및 상태 미확인 제외",()=>{
  const r=reviewRegistryRights({...base(),proposedDepositManwon:3000,rights:[
   entry(),entry({id:"m2",claimMaximumManwon:18000}),
   entry({id:"old",status:"cancelled",claimMaximumManwon:50000}),
   entry({id:"uncertain",status:"unknown",claimMaximumManwon:80000}),
  ]});
  assert.equal(r.activeMortgageCount,2);
  assert.equal(r.activeMortgageMaximumManwon,30000);
  assert.equal(r.cancelledRecords,1);
  assert.equal(r.unknownStatusRecords,1);
  assert.ok(r.notes.some(x=>x.includes("보증금 3,000만원")));
  assert.ok(r.notes.some(x=>x.includes("채권최고액은 실제 채무잔액이 아닙니다")));
 });
 it("채권최고액이 빠진 현행 근저당이 있으면 합계를 보여주지 않는다",()=>{
  const r=reviewRegistryRights({...base(),rights:[entry(),entry({id:"missing",claimMaximumManwon:null})]});
  assert.equal(r.activeMortgageCount,2);
  assert.equal(r.activeMortgageAmountsMissing,1);
  assert.equal(r.activeMortgageMaximumManwon,null);
 });
 it("신탁·압류 등 권리별 사실과 후속 확인만 제공, 등록순위 법적 결론 없음",()=>{
  const r=reviewRegistryRights({...base(),rights:[
   entry({id:"trust",kind:"trust",section:"갑구",status:"active",rankNumber:2}),
   entry({id:"seizure",kind:"seizure",section:"갑구",status:"unknown"}),
  ]});
  assert.ok(r.findings.some(x=>x.id.includes("trust")&&x.nextAction.includes("신탁원부")));
  assert.ok(r.findings.some(x=>x.id.includes("seizure")&&x.title.includes("미확인")));
  assert.ok(r.notes.some(x=>x.includes("우선순위")));
 });
 it("별도 사용자 확인만 표시하며 공적 검증 완료로 주장하지 않는다",()=>{
  const r=reviewRegistryRights({...base(),checks:{
   person_authority:"user_checked",tax_arrears:"user_checked",prior_tenants:"not_checked",
  }});
  assert.equal(r.checkedItems,2);
  assert.ok(r.findings.some(x=>x.id==="check-prior_tenants"));
  assert.equal(r.findings.some(x=>x.id==="check-person_authority"),false);
  assert.ok(r.notes.some(x=>x.includes("검증")));
 });
 it("금액 오버플로·음수·유효하지 않은 등록번호를 신뢰하지 않는다",()=>{
  const r=reviewRegistryRights({...base(),rights:[
   entry({claimMaximumManwon:-10,rankNumber:0}),
   entry({id:"large",claimMaximumManwon:Infinity}),
  ]});
  assert.equal(r.activeMortgageMaximumManwon,null);
  assert.equal(r.activeMortgageAmountsMissing,2);
  assert.ok(r.findings.some(f=>f.detail.includes("순위번호 입력값 확인 필요")));
 });
 it("50개를 넘으면 잘린 범위를 알리고 재검토한다",()=>{
  const r=reviewRegistryRights({...base(),rights:Array.from({length:53},(_,i)=>entry({id:String(i),kind:"trust"}))});
  assert.ok(r.findings.some(x=>x.id==="entry-limit"));
  assert.equal(r.findings.filter(x=>x.id.startsWith("right-")).length,50);
 });
});
