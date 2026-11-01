import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {REGISTRY_SIGNALS,registryReview} from "../lib/registry-review.ts";

describe("등기 권리관계 자가 점검은 법적 안전 판정을 내리지 않는다",()=>{
 it("권리 기재가 없을 때도 안전 판정 대신 미확인 경고를 보여준다",()=>{
  const r=registryReview([]);
  assert.deepEqual(r.findings,[]);
  assert.ok(r.notes.some(x=>x.includes("미확인")));
 });
 it("신탁·근저당·압류·선순위 임차인 미확인을 각각 별도 후속 확인으로 안내한다",()=>{
  const r=registryReview(["trust","mortgage","seizure","unknown_tenant_priority","mortgage"]);
  assert.equal(r.findings.length,4);
  assert.ok(r.findings.some(x=>x.check.includes("신탁원부")));
  assert.ok(r.findings.some(x=>x.check.includes("말소")));
  assert.equal(r.notes.some(x=>/보장하지 않/.test(x)),true);
 });
 it("잘못된 임의 값을 정리하고 주민번호·주소 같은 사용자 정보를 전달받지 않는다",()=>{
  const r=registryReview(["ownership_mismatch","malformed","unknown_tax"]);
  assert.equal(r.findings.length,2);
  assert.equal(Object.keys(REGISTRY_SIGNALS).length,9);
  assert.ok(r.findings.every(f=>typeof f.title==="string"&&typeof f.check==="string"));
 });
});
