import {test} from "node:test";
import assert from "node:assert/strict";
import {parseOwnerAiPolicy,DEFAULT_OWNER_AI_POLICY} from "../lib/owner-ai.ts";
const source={aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],answers:{pets:"고양이 가능",parking:"1대 가능",notes:""}};
test("집주인 AI 초기 상태는 비활성, 수동 확인 기반",()=>{
 assert.equal(DEFAULT_OWNER_AI_POLICY.aiEnabled,false);
 assert.equal(DEFAULT_OWNER_AI_POLICY.visitMode,"approval");
 assert.deepEqual(DEFAULT_OWNER_AI_POLICY.availability,[]);
});
test("가능 시간 및 정책 정상 저장 형식",()=>{
 const actual=parseOwnerAiPolicy(source);
 assert.equal(actual?.aiEnabled,true);
 assert.equal(actual?.availability.length,1);
 assert.equal(actual?.answers.pets,"고양이 가능");
});
test("방문시간 역전/중복/요일 오류/허위 형식 거부",()=>{
 for(const availability of [
 [{weekday:6,start:"18:00",end:"13:00"}],
 [{weekday:7,start:"13:00",end:"18:00"}],
 [{weekday:6,start:"25:00",end:"18:00"}],
 [{weekday:6,start:"13:00",end:"18:00"},{weekday:6,start:"17:00",end:"19:00"}],
 ])assert.equal(parseOwnerAiPolicy({...source,availability}),null);
});
test("알 수 없는 예약 권한·비문자 안내 거부",()=>{
 assert.equal(parseOwnerAiPolicy({...source,visitMode:"auto"}),null);
 assert.equal(parseOwnerAiPolicy({...source,answers:{...source.answers,pets:100}}),null);
 assert.equal(parseOwnerAiPolicy({...source,answers:{...source.answers,notes:"x".repeat(401)}}),null);
});
