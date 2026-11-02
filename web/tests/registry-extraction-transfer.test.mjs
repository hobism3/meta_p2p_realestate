import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {toSanitizedTransfer,parseSanitizedTransfer,REGISTRY_TRANSFER_KEY} from "../lib/registry-extraction-transfer.ts";

describe("P9 reviewed-only session handoff has no raw PDF/PII",()=>{
 it("takes only permitted rights and strips extra untrusted document fields",()=>{
  const x=[{
   id:"owner:my-real-name",kind:"mortgage",section:"을구",status:"unknown",
   rankNumber:2,claimMaximumManwon:11000,registrationDate:"2026-10-20",
   ownerName:"SECRET_OWNER_NAME",sourceText:"SECRET_SOURCE_PDF",
   jointCollateralMentioned:true,cancellationPromised:false,
  }];
  const transfer=toSanitizedTransfer(x);
  assert.equal(transfer.schema,"local-reviewed-rights-v1");
  assert.equal(transfer.rights.length,1);
  assert.equal(transfer.rights[0].id,"extracted-1");
  const serialized=JSON.stringify(transfer);
  assert.equal(serialized.includes("SECRET_OWNER_NAME"),false);
  assert.equal(serialized.includes("SECRET_SOURCE_PDF"),false);
  assert.equal(serialized.includes("owner:my-real-name"),false);
  assert.deepEqual(parseSanitizedTransfer(serialized),transfer);
  assert.ok(REGISTRY_TRANSFER_KEY.includes("registry"));
 });
 it("rejects malformed/enormous/unknown schema, invalid entries, more than 50 records",()=>{
  assert.equal(parseSanitizedTransfer("not json"),null);
  assert.equal(parseSanitizedTransfer("a".repeat(30001)),null);
  assert.equal(parseSanitizedTransfer(JSON.stringify({schema:"future",rights:[]})),null);
  assert.equal(parseSanitizedTransfer(JSON.stringify({schema:"local-reviewed-rights-v1",rights:Array(51).fill({})})),null);
  assert.equal(parseSanitizedTransfer(JSON.stringify({schema:"local-reviewed-rights-v1",rights:[{kind:"fake_right",status:"active",section:"을구"}]})),null);
 });
 it("does not invent monetary values or dates and does not coerce nonmortgage amounts",()=>{
  const x=toSanitizedTransfer([
   {id:"1",kind:"mortgage",status:"active",section:"을구",claimMaximumManwon:-100,rankNumber:-1,registrationDate:"2026-02-30"},
   {id:"2",kind:"trust",status:"unknown",section:"갑구",claimMaximumManwon:9000,rankNumber:1,registrationDate:"2026-02-28"},
  ]);
  assert.equal(x.rights[0].claimMaximumManwon,null);
  assert.equal(x.rights[0].rankNumber,null);
  assert.equal(x.rights[0].registrationDate,undefined);
  assert.equal(x.rights[1].claimMaximumManwon,null);
  assert.equal(x.rights[1].registrationDate,"2026-02-28");
 });
 it("session parser rejects invalid rights rather than silently weakening a review gate",()=>{
  const valid=JSON.stringify({schema:"local-reviewed-rights-v1",rights:[
   {kind:"mortgage",status:"unknown",section:"을구",claimMaximumManwon:9000},
  ]});
  assert.equal(parseSanitizedTransfer(valid)?.rights.length,1);
  assert.equal(parseSanitizedTransfer(JSON.stringify({schema:"local-reviewed-rights-v1",rights:[
    {kind:"mortgage",status:"verified",section:"을구"},
  ]})),null);
 });
});
