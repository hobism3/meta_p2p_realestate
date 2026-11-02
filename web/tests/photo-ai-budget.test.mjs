import {test} from "node:test";
import assert from "node:assert/strict";
import {photoAiTotalCap} from "../lib/photo-ai-budget.ts";
test("production demo allowance is finite and configurable without unlimited bypass",()=>{
 assert.equal(photoAiTotalCap("vision",{}),6);
 assert.equal(photoAiTotalCap("edit",{}),3);
 assert.equal(photoAiTotalCap("vision",{PHOTO_AI_TOTAL_VISION_CAP:"9"}),9);
 assert.equal(photoAiTotalCap("vision",{PHOTO_AI_TOTAL_VISION_CAP:"9999"}),12);
 assert.equal(photoAiTotalCap("edit",{PHOTO_AI_TOTAL_EDIT_CAP:"9999"}),5);
 assert.equal(photoAiTotalCap("edit",{PHOTO_AI_TOTAL_EDIT_CAP:"0"}),0);
 assert.equal(photoAiTotalCap("edit",{PHOTO_AI_TOTAL_EDIT_CAP:"-3"}),0);
 assert.equal(photoAiTotalCap("vision",{PHOTO_AI_TOTAL_VISION_CAP:"invalid"}),6);
});
