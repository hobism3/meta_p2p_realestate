/**
 * Global production credit guard. PostgreSQL performs the atomic reservation.
 * A finite, configurable rehearsal allowance replaces the initial 3/2 lifetime
 * proof-of-concept ceiling without allowing unrestricted spending.
 * Any DB failure fails closed. No daily reset or admin bypass.
 */
import {getDal} from "@/lib/dal";

export type PhotoAiFeature="vision"|"edit";
const CAPS:Record<PhotoAiFeature,{key:string;defaultValue:number;hardCeiling:number}>={
 vision:{key:"PHOTO_AI_TOTAL_VISION_CAP",defaultValue:6,hardCeiling:12},
 edit:{key:"PHOTO_AI_TOTAL_EDIT_CAP",defaultValue:3,hardCeiling:5},
};
export function photoAiTotalCap(feature:PhotoAiFeature,env:Record<string,string|undefined>=process.env):number{
 const limit=CAPS[feature];
 const raw=env[limit.key];
 if(raw===undefined)return limit.defaultValue;
 const parsed=Number(raw);
 if(!Number.isFinite(parsed))return limit.defaultValue;
 // Zero is an explicit emergency disable; prevent negative/overflow values.
 return Math.max(0,Math.min(limit.hardCeiling,Math.floor(parsed)));
}
export async function reservePhotoAiAttempt(feature:PhotoAiFeature):Promise<boolean>{
 if(process.env.VERCEL_ENV!=="production")return true;
 const max=photoAiTotalCap(feature);
 if(max<=0)return false;
 try{
  return await getDal().withTransaction(async tx=>{
   await tx.run(
    "INSERT INTO directhome_private.photo_ai_call_budget (feature, attempts) VALUES (?, 0) ON CONFLICT (feature) DO NOTHING",
    [feature],
   );
   const row=await tx.get(
    "UPDATE directhome_private.photo_ai_call_budget SET attempts=attempts+1, updated_at=NOW() WHERE feature=? AND attempts < ? RETURNING attempts",
    [feature,max],
   );
   return Boolean(row);
  });
 }catch{return false;}
}
