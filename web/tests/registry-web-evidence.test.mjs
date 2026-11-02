import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {extractRegistryText} from "../lib/registry-text-extraction.ts";
import {auditIndependentRightsRows} from "../lib/registry-independent-row-audit.ts";
import {toSanitizedTransfer} from "../lib/registry-extraction-transfer.ts";

const fixtures=JSON.parse(readFileSync(new URL("./fixtures/registry-hug-publisher-cases.v1.json",import.meta.url),"utf8"));
const sources=JSON.parse(readFileSync(new URL("./fixtures/registry-web-evidence.v1.json",import.meta.url),"utf8"));

describe("P12 external-publisher-sourced fact comparison, not user labels",()=>{
 it("pins the HUG institutional table and distinguishes author claims from inferred completeness",()=>{
  assert.equal(fixtures.schema,"publisher-authored-example-derived-v1");
  assert.equal(fixtures.cases.length,3);
  assert.equal(sources.schema,"registry-web-evidence-v1");
  assert.equal(sources.sources.filter(s=>s.category==="public_institution_worked_example").length,1);
  assert.equal(sources.claims.find(c=>c.id==="EX-HUG-MORTGAGE").claimMaximumManwon,200000);
  assert.equal(sources.claims.find(c=>c.id==="EX-DANGDANG-MORTGAGE").claimMaximumManwon,29000);
  for(const f of fixtures.cases){
   assert.equal(f.sourceId,"HUG-EXAMPLE");
   assert.equal(f.sourceUrl,"https://www.khug.or.kr/jeonse/web/s03/s030105.jsp");
   assert.ok(!/\d{6}[- ]?\d{7}/.test(f.text));
   assert.ok(!/실제\s*소유자/.test(f.text));
  }
 });
 for(const example of fixtures.cases){
  it(example.id+" "+example.title,()=>{
   const parsed=extractRegistryText(example.text);
   assert.equal(parsed.documentKind,"registry_like");
   const actual=parsed.candidates.map(c=>({
    kind:c.entry.kind,section:c.entry.section,rankNumber:c.entry.rankNumber,
    registrationDate:c.entry.registrationDate??null,
    claimMaximumManwon:c.entry.claimMaximumManwon??null,
   }));
   assert.deepEqual(actual,example.expectedRights);
   for(const c of parsed.candidates){
    assert.equal(c.reviewRequired,true);
    assert.equal(c.entry.status,"unknown");
   }
   const audit=auditIndependentRightsRows(example.text,parsed);
   assert.equal(audit.missingInPrimary,0);
   assert.equal(audit.notIndependentlyConfirmed,0);
   if(example.expectedRights.length)assert.equal(audit.status,"aligned_observed_rows");
   else assert.equal(audit.status,"insufficient_observable_rows");
  });
 }
 it("HUG source's 20억 recorded maximum is not actual unpaid debt or an automatic property approval",()=>{
  const mortgage=extractRegistryText(fixtures.cases[2].text).candidates[0];
  assert.equal(mortgage.entry.claimMaximumManwon,200000);
  assert.equal(mortgage.entry.status,"unknown");
  const transfer=toSanitizedTransfer([mortgage.entry]);
  assert.equal(transfer.rights[0].claimMaximumManwon,200000);
  assert.equal(transfer.rights[0].status,"unknown");
  assert.ok(!JSON.stringify(transfer).includes("depositRecoveryGuaranteed"));
 });
 it("finds a missing secondary registry row even when the primary parser silently skips it",()=>{
  const text="[PAGE 1]\n〖 갑 구 〗\n1 | 압류 | 2022년1월13일\n〖 을 구 〗\n2 | 근저당권설정 | 2022년1월14일 | 채권최고액 금2,000만원";
  const original=extractRegistryText(text);
  const filtered={...original,candidates:original.candidates.filter(c=>c.entry.kind!=="mortgage")};
  const audit=auditIndependentRightsRows(text,filtered);
  assert.equal(audit.observedRightRows,2);
  assert.equal(audit.missingInPrimary,1);
  assert.equal(audit.status,"needs_review");
  assert.ok(audit.reasons.includes("visible_numbered_right_not_extracted"));
  assert.equal(JSON.stringify(audit).includes("채권최고액"),false);
 });
 it("flags a primary candidate created without a visible numbered purpose row",()=>{
  const text="[PAGE 1]\n【을 구】\n권리자 기타사항에서 근저당권 단어만 등장\n1 | 근저당권설정 | 채권최고액 금4,000만원";
  const parsed=extractRegistryText(text);
  const tampered={...parsed,candidates:[...parsed.candidates,{...parsed.candidates[0],
   entry:{...parsed.candidates[0].entry,rankNumber:5}}]};
  const audit=auditIndependentRightsRows(text,tampered);
  assert.equal(audit.notIndependentlyConfirmed,1);
  assert.equal(audit.status,"needs_review");
 });
 it("never treats heading-only or unnumbered educational discussion as a clean title",()=>{
  const text="[PAGE 1]\n【갑 구】\n가압류·신탁 확인 요망\n【을 구】\n근저당권이 등장하지만 번호 행 없음";
  const parsed=extractRegistryText(text);
  assert.equal(parsed.candidates.length,0);
  const audit=auditIndependentRightsRows(text,parsed);
  assert.equal(audit.status,"insufficient_observable_rows");
  assert.ok(audit.reasons.includes("no_independent_observable_right_rows"));
 });
 it("requires special review for annex subrank, not treating 3-1 as rank 3",()=>{
  const text="[PAGE 1]\n〖 을 구 〗\n3 | 근저당권설정 | 2022.01.01\n3-1 | 근저당권변경 | 2022.01.02";
  const parsed=extractRegistryText(text);
  const audit=auditIndependentRightsRows(text,parsed);
  assert.equal(audit.complexSubrankRows,1);
  assert.equal(audit.status,"needs_review");
 });
 it("applying PDF-style separators to section headings does not change detected right facts",()=>{
  const input=fixtures.cases[0].text;
  const altered=input.replace("【갑 구】","【갑|구】").replace("【을 구】","【을|구】").replace(/\n/g,"\r\n");
  const p=extractRegistryText(input),q=extractRegistryText(altered);
  assert.deepEqual(q.candidates.map(c=>c.entry.kind),p.candidates.map(c=>c.entry.kind));
  assert.deepEqual(q.candidates.map(c=>c.entry.claimMaximumManwon),p.candidates.map(c=>c.entry.claimMaximumManwon));
  assert.equal(auditIndependentRightsRows(altered,q).missingInPrimary,0);
 });
});
