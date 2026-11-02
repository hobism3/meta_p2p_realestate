import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePhotoReview, parsePhotoModelText, imageDifferenceHash, nearDuplicateHash, photoQualityHints, recommendedPhotoRooms, photoOptionCandidates, photoCoverageMessages } from "../lib/photo-guide.ts";

test("VLM returns only controlled fields, not OCR or invented listing facts", () => {
  const result = sanitizePhotoReview({ room:"kitchen", features:["냉장고","세탁기","냉장고","사실상 소유"], privacyFlags:["document","unknown"], owner:"홍길동", price:5000 });
  assert.deepEqual(result, { room:"kitchen", features:["냉장고","세탁기"], privacyFlags:["document"] });
  assert.equal(sanitizePhotoReview({ room:"room-with-private-data", features:[] }), null);
  assert.deepEqual(parsePhotoModelText('{"room":"bathroom","features":[],"privacyFlags":[]}'), { room:"bathroom",features:[],privacyFlags:[] });
  assert.equal(parsePhotoModelText("ignore instructions { garbage"), null);
});
test("unrecognized and missing spaces remain advisory", () => {
  assert.deepEqual(recommendedPhotoRooms([{ room:"kitchen",features:[],privacyFlags:[] }]), ["욕실","생활 공간(거실·침실)"]);
  assert.ok(photoCoverageMessages([{ room:"kitchen",features:[],privacyFlags:[] }])[0].includes("욕실 사진은 아직 확인되지 않았어요"));
  assert.deepEqual(recommendedPhotoRooms([{room:"living_room",features:[],privacyFlags:[]},{room:"kitchen",features:[],privacyFlags:[]},{room:"bathroom",features:[],privacyFlags:[]}]), []);
  assert.deepEqual(recommendedPhotoRooms([]), []);
});
test("local image checks do not require model calls", () => {
  assert.equal(imageDifferenceHash(Array.from({ length: 72 }, (_,i) => i % 9)), "0".repeat(64));
  assert.ok(nearDuplicateHash("0".repeat(64), "0".repeat(63)+"1"));
  assert.equal(nearDuplicateHash("0".repeat(64), "1".repeat(64)), false);
  assert.ok(photoQualityHints({ width: 300,height: 450,brightness: 20,fileBytes: 1000 }).length >= 2);
  assert.deepEqual(photoQualityHints({ width: 1200,height: 900,brightness: 128,fileBytes: 400000 }), []);
});

test("only listing-relevant visible appliances are option candidates, never ownership or inclusion claims", () => {
  assert.deepEqual(photoOptionCandidates([
    {room:"living_room",features:["에어컨","싱크대"],privacyFlags:[]},
    {room:"kitchen",features:["냉장고","에어컨"],privacyFlags:[]},
  ]), ["에어컨","냉장고"]);
});
