import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const catalog=JSON.parse(readFileSync(new URL("./fixtures/registry-public-sources.v1.json",import.meta.url),"utf8"));
describe("P11 provenance registry of publicly hosted educational PDFs",()=>{
 it("registers exactly five publisher fictional source URLs with pinned original SHA",()=>{
  assert.equal(catalog.schema,"public-registry-corpus-sources-v1");
  assert.equal(catalog.references.length,5);
  assert.equal(new Set(catalog.references.map(x=>x.id)).size,5);
  for(const source of catalog.references){
   assert.match(source.id,/^DANGDANG-[A-Z-]+$/);
   assert.equal(new URL(source.url).hostname,"dangdang.io");
   assert.equal(new URL(source.url).protocol,"https:");
   assert.equal(source.kind,"explicit_educational_fiction");
   assert.equal(source.distribution,"source-link-only");
   assert.match(source.sha256,/^[a-f0-9]{64}$/);
   assert.ok(Number.isSafeInteger(source.priorObservedBytes)&&source.priorObservedBytes>100000);
   assert.ok(source.automatedCorpusExpectation);
  }
 });
 it("holds separate declared-type expectations, not invented legal safe ratings",()=>{
  const table=Object.fromEntries(catalog.references.map(x=>[x.id,x.automatedCorpusExpectation]));
  assert.equal(table["DANGDANG-NORMAL"].totalCandidates,0);
  assert.equal(table["DANGDANG-PROVISIONAL"].atLeast.provisional_seizure,1);
  assert.equal(table["DANGDANG-MORTGAGE"].atLeast.mortgage,2);
  assert.equal(table["DANGDANG-MORTGAGE"].mortgageTotalManwon,29000);
  assert.equal(table["DANGDANG-MULTI"].atLeast.auction_commencement,1);
  assert.equal(table["DANGDANG-FIXED-DATE"].totalCandidates,0);
  assert.equal(JSON.stringify(catalog).includes("safeRiskScore"),false);
  assert.equal(JSON.stringify(catalog).includes("actualPropertyIsSafe"),false);
 });
 it("separates real identifiable certificate data from fictional educational PDFs",()=>{
  assert.match(catalog.excludedActualRecords.reason,/개인/);
  assert.equal(catalog.otherPublicPdfExamples.length,4);
  const ids=new Set(catalog.otherPublicPdfExamples.map(x=>x.id));
  assert.ok(ids.has("EBS-LEGAL-2008"));
  assert.ok(ids.has("JOBGO-GA-2017"));
 });
});
