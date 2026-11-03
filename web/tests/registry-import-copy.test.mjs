import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registryImportMessage,registryFieldGloss} from '../lib/registry-import-copy.ts';
import {mockRegistryDraft,makeSampleRegistryPdf} from '../lib/registry-draft.ts';
import {registryDraftTitle} from '../lib/registry-title.ts';

test('sample draft safety cautions have English copy without changing the source draft',()=>{
 const draft=mockRegistryDraft(makeSampleRegistryPdf());
 assert.ok(draft);
 const before=JSON.stringify(draft);
 for(const warning of draft.cautions){
  assert.doesNotMatch(registryImportMessage(warning,true),/[가-힣]/);
  assert.equal(registryImportMessage(warning,false),warning);
 }
 assert.equal(JSON.stringify(draft),before);
 assert.equal(registryFieldGloss('집합건물'),'Condominium building');
 assert.equal(registryFieldGloss('Unknown source name'),undefined);
});

test('stream progress and HTTP failure details are readable in English',()=>{
 assert.equal(registryImportMessage('서버 연결 완료 · 문서 검증 중',true),'Connected · Checking the document');
 assert.match(registryImportMessage('Meta 분석에 실패했습니다(HTTP 502). 다시 시도하거나 직접 입력해 주세요.',true),/HTTP 502/);
 assert.match(registryImportMessage('새로운 서버 오류',true),/^Original service message \(Korean\): 새로운 서버 오류$/);
});

test('English draft title translates generated labels, preserving source names and unit identifiers',()=>{
 const field=value=>({value,evidence:'source'});
 const draft={buildingName:field('원문 건물명'),buildingType:field('아파트'),buildingDong:field('105'),floor:field('5'),unit:field('0501')};
 assert.equal(registryDraftTitle(draft,true),'원문 건물명 · Building 105 · Unit 0501 (Needs review)');
 assert.equal(registryDraftTitle(draft),'원문 건물명 105동 0501호 (확인 필요)');
 assert.equal(draft.unit.value,'0501');
});
