import {test} from "node:test";
import assert from "node:assert/strict";
import {sanitizeSharedRights,safePublicBriefRow,validBriefDate,MISSING_RIGHTS_NOTE} from "../lib/listing-rights-brief.ts";
const base={id:"private-doc-line",kind:"mortgage",section:"을구",status:"cancelled",
 rankNumber:1,claimMaximumManwon:29000,registrationDate:"2026-10-20",jointCollateralMentioned:true,
 cancellationPromised:true,creditorName:"이름 표시 금지",ownerAddress:"주소 표시 금지"};
test("always changes all owner-provided cancellation claims to legally unknown",()=>{
 const result=sanitizeSharedRights([base]);
 assert.equal(result.length,1);
 assert.equal(result[0].status,"unknown");
 assert.equal(result[0].claimMaximumManwon,29000);
 assert.equal(result[0].jointCollateralMentioned,true);
 assert.equal(result[0].cancellationPromised,true);
 assert.equal(JSON.stringify(result).includes("creditorName"),false);
 assert.equal(JSON.stringify(result).includes("ownerAddress"),false);
 assert.equal(JSON.stringify(result).includes("private-doc-line"),false);
});
test("rejects empty, malformed, oversized right arrays rather than publishing a safe-looking zero",()=>{
 assert.equal(sanitizeSharedRights([]),null);
 assert.equal(sanitizeSharedRights([{}]),null);
 assert.equal(sanitizeSharedRights(Array(21).fill(base)),null);
 assert.equal(sanitizeSharedRights([{...base,kind:"script"}]),null);
});
test("public summary never contains legal verified or private source claims",()=>{
 const row={rights_json:JSON.stringify([base]),issued_on:"2026-10-20",shared_at:"2026-11-02",
  shared_by:"private-owner-id",pdf:"data:application/pdf;base64,private"};
 const result=safePublicBriefRow(row);
 assert.equal(result.available,true);
 assert.equal(result.verified,false);
 assert.equal(result.rights[0].status,"unknown");
 assert.equal(JSON.stringify(result).includes("private"),false);
 assert.equal(safePublicBriefRow(undefined).note,MISSING_RIGHTS_NOTE);
 assert.equal(safePublicBriefRow({rights_json:"[]"}).available,false);
});
test("rejects invalid and future issued dates",()=>{
 assert.equal(validBriefDate("2026-11-02"),"2026-11-02");
 assert.equal(validBriefDate("2026-02-30"),"");
 assert.equal(validBriefDate("2099-01-01"),"");
 assert.equal(validBriefDate("오늘"),"");
});
