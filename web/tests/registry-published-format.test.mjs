import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {extractRegistryText,REGISTRY_TEXT_MAX_LINES} from "../lib/registry-text-extraction.ts";
import {toSanitizedTransfer} from "../lib/registry-extraction-transfer.ts";

const dataset=JSON.parse(readFileSync(new URL("./fixtures/registry-published-format.v1.json",import.meta.url),"utf8"));
describe("P11 explicitly synthetic adaptations of published educational registry layouts",()=>{
 it("records published source IDs without copying real persons or implying official PDF ground truth",()=>{
  assert.equal(dataset.schema,"published-registry-format-adaptations-v1");
  assert.equal(dataset.cases.length,6);
  assert.equal(new Set(dataset.cases.map(x=>x.id)).size,6);
  for(const c of dataset.cases){
   assert.match(c.id,/^P11-/);
   assert.ok(c.description.length>=15);
   assert.ok(c.sourceId);
   assert.ok(c.snippet.length>=30);
   assert.ok(!/\b\d{6}-\d{7}\b/.test(c.snippet),c.id+" copied identification number");
   assert.ok(!/서울특별시\s*\S+\s*\S+/.test(c.snippet),c.id+" appears to contain street address");
  }
 });
 for(const c of dataset.cases){
  it(c.id+" "+c.description,()=>{
   const out=extractRegistryText(c.snippet);
   assert.deepEqual(out.candidates.map(x=>x.entry.kind),c.expected.kinds,c.id+" rights");
   assert.deepEqual(out.candidates.map(x=>x.entry.claimMaximumManwon??null),c.expected.amounts,c.id+" amount");
   assert.deepEqual(out.candidates.map(x=>x.entry.registrationDate??null),c.expected.dates,c.id+" date");
   assert.equal(out.coverage.ambiguousNumberedRows,c.expected.ambiguousNumberedRows,c.id+" subrank");
   for(const candidate of out.candidates){
    assert.equal(candidate.entry.status,"unknown",c.id+" no automatic status promotion");
    assert.equal(candidate.reviewRequired,true,c.id);
   }
  });
 }
 it("preserves a historical date only as a user-reviewed structured fact",()=>{
  const input=extractRegistryText(dataset.cases.find(x=>x.id==="P11-KOCW-02").snippet);
  const handoff=toSanitizedTransfer(input.candidates.map(c=>c.entry));
  assert.equal(handoff.rights[0]?.registrationDate,"1995-06-12");
  assert.equal(handoff.rights[0]?.status,"unknown");
 });
 it("refuses an oversized document rather than reporting an incomplete first-1800-line extract",()=>{
  const raw="[PAGE 1]\n〖 갑 구 〗\n1 | 가압류 | 2026.01.01\n"
   +Array.from({length:REGISTRY_TEXT_MAX_LINES+5},(_,i)=>"line "+i).join("\n");
  const out=extractRegistryText(raw);
  assert.equal(out.candidates.length,0);
  assert.equal(out.documentKind,"unrecognized");
  assert.ok(out.warnings.some(x=>x.includes("상한")));
 });
});
