import {test} from "node:test";
import assert from "node:assert/strict";
import {buildTransactionJourney} from "../lib/transaction-journey.ts";
import {buildCompanionTasks} from "../lib/jiptok-support-tasks.ts";

const statuses=["visit","price","living","contract","earnest","handover"];
function snapshot(statusMap={},demo=false){
 return {tradeType:"월세",demo,confirmedCount:0,
  nextStep:{key:"visit",title:"확인",hint:"별도 확인"},
  stages:statuses.map(key=>({
   key,label:key,status:statusMap[key]??"not-started",confirmedValue:null,
   pendingValue:null,detail:"상황을 확인하세요.",evidence:[],confirmedProposalId:null,pendingProposalId:null,
  }))};
}
test("pre-agreement shows all stages unverified and useful links, no implied contract",()=>{
 const rows=buildTransactionJourney(snapshot(),"some-listing");
 assert.deepEqual(rows.map(r=>r.key),["visit","terms","registry","legal_prep"]);
 assert.equal(rows[0].status,"discussion");
 assert.equal(rows[1].status,"discussion");
 assert.equal(rows[2].status,"unverified_external");
 assert.equal(rows[3].status,"unverified_external");
 assert.equal(rows[2].target,"/listings/some-listing#registry-rights");
 assert.match(rows[3].detail,/계약/);
});
test("a requested visit and unilateral offer are never confirmed",()=>{
 const rows=buildTransactionJourney(snapshot({visit:"pending",price:"pending"}),"user-listing");
 assert.equal(rows[0].status,"awaiting_both");
 assert.equal(rows[1].status,"awaiting_both");
 assert.match(rows[0].detail,/집주인/);
});
test("even full bilateral confirmations cannot confirm registry/legal payment or sign a contract",()=>{
 const all=Object.fromEntries(statuses.map(s=>[s,"confirmed"]));
 const rows=buildTransactionJourney(snapshot(all),"s01");
 assert.equal(rows[0].status,"app_confirmed");
 assert.equal(rows[1].status,"app_confirmed");
 assert.equal(rows[2].status,"unverified_external");
 assert.equal(rows[3].status,"unverified_external");
 assert.ok(!/계약 완료|안전 인증/.test(rows[3].statusLabel));
});
test("new pending change after confirmed price resets journey terms to awaiting both",()=>{
 const rows=buildTransactionJourney(snapshot({price:"confirmed",living:"pending"}),"some-listing");
 assert.equal(rows[1].status,"awaiting_both");
});
test("links to rights are property-specific, companion reminders share the same source",()=>{
 const snap=snapshot({price:"pending"});
 assert.ok(buildCompanionTasks(snap,4,"some-listing").some(x=>x.kind==="rights_check"&&x.target==="/listings/some-listing#registry-rights"));
 assert.equal(buildCompanionTasks(snap).at(-1).target,"/registry/check");
 assert.equal(buildTransactionJourney(snap,"../../private")[2].target,"/registry/check");
});
test("empty, invalid and missing projections never mark steps confirmed",()=>{
 assert.deepEqual(buildTransactionJourney(null,"id"),[]);
});
