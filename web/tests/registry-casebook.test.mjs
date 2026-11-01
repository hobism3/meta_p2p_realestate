import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewRegistryRights,RIGHT_LABELS} from "../lib/registry-rights-analysis.ts";

const corpus=JSON.parse(readFileSync(new URL("./fixtures/registry-cases.v1.json",import.meta.url),"utf8"));
const fixtures=corpus.fixtures;
const rights=(caseItem)=>reviewRegistryRights(caseItem.input);
const findingIds=(result)=>new Set(result.findings.map(f=>f.id));
const DETECTABILITY=new Set(["title-record","cross-document","outside-registry","timing","composite","data-quality"]);

describe("P8 사례 원장: 재현 가능한 합성 Golden 데이터의 출처·품질",()=>{
 it("종류·검출가능성·출처·직접 기입된 기대값 모두 갖춘다",()=>{
  assert.equal(corpus.schema,"directhome-registry-casebook-v1");
  assert.equal(fixtures.length,38);
  assert.equal(new Set(fixtures.map(x=>x.id)).size,fixtures.length);
  assert.ok(new Set(fixtures.map(x=>x.category)).size>=7);
  assert.ok(new Set(fixtures.map(x=>x.detectability)).size>=4);
  for(const c of fixtures){
   assert.match(c.id,/^P8-\d{3}$/);
   assert.ok(c.title.length>=6);
   assert.equal(c.provenance,"synthetic_derived_pattern");
   assert.ok(DETECTABILITY.has(c.detectability),c.id);
   assert.ok(c.sourceIds.length>=1,c.id);
   for(const s of c.sourceIds){
    assert.ok(Object.hasOwn(corpus.sourceIds,s),c.id+" unknown source "+s);
    const u=new URL(corpus.sourceIds[s]);
    assert.equal(u.protocol,"https:",c.id);
   }
   assert.ok(c.note.length>=10,c.id);
   assert.ok(Array.isArray(c.expected.requiredFindingIds),c.id);
   assert.ok(Array.isArray(c.expected.forbiddenFindingIds),c.id);
   assert.equal(typeof c.expected.activeMortgageCount,"number",c.id);
   assert.ok(Array.isArray(c.input.rights),c.id);
   for(const right of c.input.rights){
    assert.ok(Object.hasOwn(RIGHT_LABELS,right.kind),c.id);
    assert.ok(["active","unknown","cancelled"].includes(right.status),c.id);
    assert.ok(["갑구","을구","unknown"].includes(right.section),c.id);
    assert.equal(typeof right.id,"string",c.id);
   }
  }
 });
 it("원본 등기·계약당사자 이름·주소·민감 식별번호와 법적 안전 정답이 없다",()=>{
  assert.equal(fixtures.some(x=>x.realFilePath||x.originalPdf||x.ownerName||x.address||x.rrn),false);
  for(const x of fixtures){
   assert.equal(x.legalOutcome,undefined,x.id+" no adjudicated legal result");
   assert.equal(x.certifiedSafe,undefined,x.id+" no fraudulent safe certification");
   assert.equal(x.input.realOwner,undefined,x.id);
   assert.equal(x.input.contractAddress,undefined,x.id);
   assert.equal(x.input.rrn,undefined,x.id);
  }
 });
});

describe("P8 사례별 기대 발견/제외 Golden 회귀 (모델 생성 정답 사용 금지)",()=>{
 for(const fixture of fixtures){
  it(`${fixture.id} ${fixture.title}`,()=>{
   const result=rights(fixture);
   const exp=fixture.expected, ids=findingIds(result);
   for(const key of [
    "activeMortgageCount","activeMortgageMaximumManwon","activeMortgageAmountsMissing",
    "cancelledRecords","unknownStatusRecords",
   ])assert.deepEqual(result[key],exp[key],`${fixture.id}: ${key}`);
   for(const id of exp.requiredFindingIds){
    assert.ok(ids.has(id),`${fixture.id}: missing finding ${id}`);
   }
   for(const id of exp.forbiddenFindingIds){
    assert.equal(ids.has(id),false,`${fixture.id}: forbidden finding ${id}`);
   }
   assert.ok(result.notes.some(x=>x.includes("실제 채무잔액")),fixture.id+" must explain maximum vs debt");
   assert.ok(result.notes.some(x=>x.includes("검증 결과가 아닙니다")),fixture.id+" self check is not verification");
   assert.ok(result.notes.some(x=>x.includes("보증금 회수가능액")),fixture.id+" no deposit recovery promise");
   const all=[...result.findings.map(x=>x.title),...result.notes];
   assert.equal(all.some(x=>/안전한 거래 확정|사기 없음 확정|법적 보호를 보장|매매 안전등급 A/.test(x)),false);
  });
 }
});
describe("P8 교차·변형 사례: 허위 확정 방지",()=>{
 it("실제 원본이 확인되지 않은 빈 등기 입력은 미검증을 유지한다",()=>{
  const x=rights(fixtures.find(c=>c.id==="P8-001"));
  assert.ok(findingIds(x).has("unread-rights"));
  assert.equal(x.activeMortgageMaximumManwon,null);
 });
 it("말소 약속이 있어도 현행 근저당은 그대로 합산하고 말소 확인을 촉구한다",()=>{
  const base=fixtures.find(c=>c.id==="P8-008");
  const a=rights(base),b=reviewRegistryRights({
   ...base.input,rights:base.input.rights.map(r=>({...r,cancellationPromised:false})),
  });
  assert.equal(a.activeMortgageMaximumManwon,b.activeMortgageMaximumManwon);
  assert.equal(a.cancelledRecords,b.cancelledRecords);
  assert.ok(a.findings.some(f=>f.id.includes("promise-")));
  assert.equal(b.findings.some(f=>f.id.includes("promise-")),false);
 });
 it("공동담보는 별도 증빙 필요 경고이지 근저당 합계/채무잔액 자동 증감 아님",()=>{
  const base=fixtures.find(c=>c.id==="P8-011");
  const a=rights(base);
  const b=reviewRegistryRights({...base.input,rights:base.input.rights.map(r=>({...r,jointCollateralMentioned:false}))});
  assert.equal(a.activeMortgageMaximumManwon,b.activeMortgageMaximumManwon);
  assert.ok(a.findings.some(x=>x.id.startsWith("joint-")));
  assert.equal(b.findings.some(x=>x.id.startsWith("joint-")),false);
 });
 it("등기부에 안 나타날 수 있는 정보는 근저당이 없더라도 별도 자료가 필요하다",()=>{
  for(const id of ["P8-021","P8-025","P8-026","P8-027","P8-028","P8-029","P8-031"]){
   const result=rights(fixtures.find(c=>c.id===id));
   assert.equal(result.activeMortgageMaximumManwon,null,id);
   assert.ok(result.findings.some(f=>f.id.startsWith("check-")),id);
  }
 });
 it("경매개시·가등기·임차권등기를 다른 권리 이름으로 뭉개지 않는다",()=>{
  for(const [id,word] of [["P8-016","경매개시결정"],["P8-017","가등기"],["P8-024","임차권등기"]]){
   const result=rights(fixtures.find(c=>c.id===id));
   assert.ok(result.findings.some(f=>f.title.includes(word)),id);
  }
 });
 it("금액을 알 수 없는 현행 근저당이 있으면 다른 숫자를 합산한 '전체' 값을 노출하지 않는다",()=>{
  for(const id of ["P8-010","P8-035"]){
   const result=rights(fixtures.find(c=>c.id===id));
   assert.equal(result.activeMortgageMaximumManwon,null,id);
   assert.ok(result.activeMortgageAmountsMissing>0,id);
  }
 });
});
