import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 extractRegistryText,REGISTRY_TEXT_MAX_CHARS,
 REGISTRY_TEXT_MAX_RIGHTS,REGISTRY_TEXT_MAX_LINES,
} from "../lib/registry-text-extraction.ts";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/registry-text-layer.v1.json",import.meta.url),"utf8"));
describe("P9 text-layer goldens: 15 independently authored fictional snippets",()=>{
 it("dataset has stable IDs, explicit expectations, no real title document",()=>{
  assert.equal(fixture.schema,"registry-text-fixtures-v1");
  assert.equal(fixture.cases.length,15);
  assert.equal(new Set(fixture.cases.map(c=>c.id)).size,15);
  for(const c of fixture.cases){
   assert.match(c.id,/^P9-T\d{2}$/);
   assert.ok(c.name.length>=7,c.id);
   assert.equal(typeof c.text,"string");
   assert.ok(c.text.length>10,c.id);
   assert.ok(Array.isArray(c.expect.kinds),c.id);
   assert.ok(Array.isArray(c.expect.amounts),c.id);
  }
 });
 for(const c of fixture.cases){
  it(c.id+" "+c.name,()=>{
   const result=extractRegistryText(c.text);
   assert.equal(result.schema,"registry-text-extraction-v1",c.id);
   assert.equal(result.documentKind,c.expect.documentKind,c.id);
   assert.deepEqual(result.candidates.map(x=>x.entry.kind),c.expect.kinds,c.id+" kinds");
   assert.deepEqual(result.candidates.map(x=>x.entry.claimMaximumManwon??null),c.expect.amounts,c.id+" amounts");
   assert.equal(result.cancellationMentions,c.expect.cancellations,c.id+" cancellations");
   assert.equal(result.coverage.unresolvedCancellationRows,c.expect.unresolved,c.id+" unmatched");
   if(c.expect.cancellationFlags)
    assert.deepEqual(result.candidates.map(x=>x.cancellationMentioned),c.expect.cancellationFlags,c.id+" flags");
   if(c.expect.pages)
    assert.deepEqual(result.candidates.map(x=>x.evidence.page),c.expect.pages,c.id+" pages");
   if(c.expect.amountEvidence)
    assert.deepEqual(result.candidates.map(x=>x.amountEvidence),c.expect.amountEvidence,c.id+" amount basis");
   for(const found of result.candidates){
    assert.equal(found.reviewRequired,true,c.id);
    assert.equal(found.entry.status,"unknown",c.id+" extracted status must never be auto approved");
    assert.ok(found.evidence.line>0,c.id);
    assert.ok(["갑구","을구"].includes(found.entry.section),c.id);
    assert.ok(found.warnings.length>=1,c.id);
   }
   // A copied source line may include an owner's or creditor's name. Never
   // return raw source lines or unallowlisted text in the result object.
   assert.equal(JSON.stringify(result).includes("IDENTITY_SECRET_SENTINEL"),false,c.id);
  });
 }
});
describe("P9 refusal paths & conservative transitions",()=>{
 it("unsupported text, oversized input and invalid types fail closed",()=>{
  for(const value of [null,{},"",5,"abcdefgh"]){
   const x=extractRegistryText(value);
   assert.deepEqual(x.candidates,[]);
   assert.equal(x.documentKind,"unrecognized");
  }
  const x=extractRegistryText("a".repeat(REGISTRY_TEXT_MAX_CHARS+1));
  assert.equal(x.candidates.length,0);
  assert.ok(x.warnings.some(w=>w.includes("상한")));
 });
 it("a text-copy '말소' hint never promotes the underlying title record to cancelled",()=>{
  const x=extractRegistryText(fixture.cases.find(c=>c.id==="P9-T03").text);
  assert.equal(x.candidates.length,1);
  assert.equal(x.candidates[0].cancellationMentioned,true);
  assert.equal(x.candidates[0].entry.status,"unknown");
 });
 it("real labels mixed with prose but without numbered table rows cannot create rights",()=>{
  const x=extractRegistryText("[PAGE 1]\n【갑 구】\n근저당권 및 가압류와 신탁은 확인하세요.\n채권최고액 금5억원");
  assert.deepEqual(x.candidates,[]);
  assert.ok(x.warnings.some(w=>w.includes("권리가 없다는 의미가 아닙니다")));
 });
 it("duplicate references and cross-section cancellations do not silently cancel rights",()=>{
  const x=extractRegistryText("[PAGE 1]\n【갑 구】\n1 | 가압류 | 2026.02.01\n【을 구】\n2 | 1번가압류말소 | 2026.02.02");
  assert.equal(x.candidates.length,1);
  assert.equal(x.coverage.unresolvedCancellationRows,1);
  assert.equal(x.candidates[0].entry.status,"unknown");
  assert.equal(x.candidates[0].cancellationMentioned,false);
 });
 it("source-only pages/lines are bounded and can never put raw text in the result",()=>{
  let s="[PAGE 1]\n【을 구】\n";
  for(let i=1;i<=REGISTRY_TEXT_MAX_RIGHTS+15;i++)s+=i+" | 근저당권설정 | 2026.01.01 | 채권최고액 금1천만원\n";
  const x=extractRegistryText(s);
  assert.equal(x.candidates.length,0);
  assert.ok(x.warnings.some(w=>w.includes("50")));
  const all=JSON.stringify(x);
  assert.ok(!all.includes("sourceText"));
  assert.equal(x.coverage.candidateRows,0);
  assert.equal(x.documentKind,"unrecognized");
  assert.ok(REGISTRY_TEXT_MAX_LINES>REGISTRY_TEXT_MAX_RIGHTS);
 });
 it("won amounts that are not integer 만원 are not rounded or fabricated",()=>{
  const x=extractRegistryText(fixture.cases.find(c=>c.id==="P9-T10").text);
  assert.equal(x.candidates[0].entry.claimMaximumManwon,null);
  assert.equal(x.candidates[0].amountEvidence,"missing");
 });
});
