import {toSanitizedTransfer} from "./registry-extraction-transfer.ts";
import {RIGHT_LABELS,type RightEntry} from "./registry-rights-analysis.ts";

/** Public facts are owner-supplied observations, never legally verified.
 * Do not permit cancellation/active claims from an unverified PDF scan.
 */
export const MAX_SHARED_RIGHTS=20;
export type SharedRight=Pick<RightEntry,"kind"|"section"|"status"|"rankNumber"|"claimMaximumManwon"|"registrationDate"|"jointCollateralMentioned"|"cancellationPromised">;
export const BRIEF_SOURCE="owner_local_review";
export const MISSING_RIGHTS_NOTE="등기 권리기재를 공유하지 않았습니다. 권리가 없거나 안전하다는 뜻이 아닙니다.";
export function validBriefDate(v:unknown):string{
 if(typeof v!=="string"||!/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(v))return "";
 const timestamp=Date.parse(v+"T00:00:00Z");
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==v||timestamp>Date.now())return "";
 return v;
}
export function sanitizeSharedRights(raw:unknown):SharedRight[]|null{
 if(!Array.isArray(raw)||raw.length===0||raw.length>MAX_SHARED_RIGHTS)return null;
 // Reject invalid kinds/sections/statuses wholesale; no silent partial import.
 const accepted=toSanitizedTransfer(raw as RightEntry[]);
 if(accepted.rights.length!==raw.length)return null;
 const allowed=new Set(Object.keys(RIGHT_LABELS));
 return accepted.rights.map(right=>{
  if(!allowed.has(right.kind))return null;
  return {
   kind:right.kind,section:right.section,status:"unknown" as const,
   rankNumber:right.rankNumber,claimMaximumManwon:right.kind==="mortgage"?right.claimMaximumManwon:null,
   registrationDate:validBriefDate(right.registrationDate)||undefined,
   jointCollateralMentioned:right.kind==="mortgage"&&right.jointCollateralMentioned===true,
   cancellationPromised:right.cancellationPromised===true,
  };
 }).filter((item):item is SharedRight=>item!==null);
}
export function safePublicBriefRow(row:Record<string,unknown>|undefined):{
 available:boolean;source:string;verified:false;issuedOn:string;sharedAt:string;rights:SharedRight[];note:string;
}{
 const base={available:false,source:BRIEF_SOURCE,verified:false,issuedOn:"",sharedAt:"",rights:[] as SharedRight[],note:MISSING_RIGHTS_NOTE};
 if(!row)return base;
 try{
  const parsed=JSON.parse(String(row.rights_json??"[]")) as unknown;
  const rights=sanitizeSharedRights(parsed);
  if(!rights||rights.length===0)return base;
  return {available:true,source:BRIEF_SOURCE,verified:false,
   issuedOn:validBriefDate(row.issued_on)??"",sharedAt:String(row.shared_at??""),
   rights,note:"게시자가 직접 입력·검토한 권리기재 후보입니다. 발급 원본, 현행/말소, 소유자·임대권한과 법적 효력은 독립 검증되지 않았습니다."};
 }catch{return base;}
}
