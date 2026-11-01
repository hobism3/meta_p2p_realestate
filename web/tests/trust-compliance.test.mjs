import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {callbackSignatureOk,safeVerificationUrl,hashProviderSubject,identityProviderConfig}
 from "../lib/identity-provider-bridge.ts";
const secret="z".repeat(48);
describe("외부 본인확인 신뢰 경계",()=>{
 it("연동 설정이 없으면 아무 인증 결과도 생성할 수 없다",()=>{
  assert.equal(identityProviderConfig(),null);
 });
 it("검증 페이지는 계약된 https 출처로만 이동한다",()=>{
  assert.equal(safeVerificationUrl("https://verify.example.com/start/123","https://verify.example.com"),
   "https://verify.example.com/start/123");
  assert.equal(safeVerificationUrl("http://verify.example.com/start","https://verify.example.com"),null);
  assert.equal(safeVerificationUrl("https://evil.example.com/start","https://verify.example.com"),null);
  assert.equal(safeVerificationUrl("javascript:alert(1)","https://verify.example.com"),null);
  assert.equal(safeVerificationUrl("https://evil.test@verify.example.com/start","https://verify.example.com"),null);
 });
 it("callback HMAC는 위조, 변조, 5분 초과, 단축 시크릿을 거절한다",()=>{
  const nowSeconds=1800000000,ts=String(nowSeconds),body='{"status":"verified"}';
  const sig=createHmac("sha256",secret).update(ts+"."+body).digest("hex");
  assert.equal(callbackSignatureOk(body,ts,sig,secret,nowSeconds),true);
  assert.equal(callbackSignatureOk(body+" ",ts,sig,secret,nowSeconds),false);
  assert.equal(callbackSignatureOk(body,ts,sig,secret,nowSeconds+301),false);
  assert.equal(callbackSignatureOk(body,ts,"a".repeat(64),secret,nowSeconds),false);
  assert.equal(callbackSignatureOk(body,ts,sig,"abc",nowSeconds),false);
 });
 it("원본 본인식별자 대신 목적별 keyed digest만 남긴다",()=>{
  assert.match(hashProviderSubject("example-person",secret),/^[a-f0-9]{64}$/);
  assert.notEqual(hashProviderSubject("example-person",secret),hashProviderSubject("example-person","y".repeat(48)));
 });
});
