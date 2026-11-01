import { getDal } from "./dal.ts";
import { now } from "./db.ts";
import { isListingOwner } from "./authz.ts";

export type Availability = { weekday: number; start: string; end: string };
export type OwnerAiPolicy = {
  aiEnabled: boolean;
  visitMode: "approval" | "manual";
  availability: Availability[];
  answers: { pets: string; parking: string; notes: string };
  updatedAt: string | null;
};
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_OWNER_AI_POLICY: OwnerAiPolicy = {
  aiEnabled: false, visitMode: "approval", availability: [],
  answers: { pets: "", parking: "", notes: "" }, updatedAt: null,
};
export function parseOwnerAiPolicy(input: unknown): OwnerAiPolicy | null {
  if (!input || typeof input !== "object") return null;
  const x = input as Record<string,unknown>;
  if (typeof x.aiEnabled !== "boolean") return null;
  if (x.visitMode !== "approval" && x.visitMode !== "manual") return null;
  if (!Array.isArray(x.availability) || x.availability.length > 21) return null;
  const slots: Availability[] = [];
  for (const item of x.availability) {
    if (!item || typeof item !== "object") return null;
    const a = item as Record<string,unknown>;
    if (typeof a.weekday !== "number" || !Number.isInteger(a.weekday) || a.weekday < 0 || a.weekday > 6
      || typeof a.start !== "string" || typeof a.end !== "string"
      || !clock.test(a.start) || !clock.test(a.end) || a.start >= a.end) return null;
    slots.push({weekday:a.weekday,start:a.start,end:a.end});
  }
  const sorted = slots.sort((a,b)=>a.weekday-b.weekday || a.start.localeCompare(b.start));
  for (let i=1;i<sorted.length;i++){
    const prev=sorted[i-1], cur=sorted[i];
    if (prev.weekday===cur.weekday && cur.start<prev.end) return null;
  }
  if (!x.answers || typeof x.answers !== "object" || Array.isArray(x.answers)) return null;
  const a=x.answers as Record<string,unknown>;
  for(const key of ["pets","parking","notes"]){if(typeof a[key]!=="string" || (a[key] as string).length>400) return null;}
  return {
    aiEnabled:x.aiEnabled,visitMode:x.visitMode,availability:sorted,
    answers:{pets:(a.pets as string).trim(),parking:(a.parking as string).trim(),notes:(a.notes as string).trim()},
    updatedAt:null,
  };
}
export async function ownerListingExists(listingId:string, userId:string):Promise<boolean>{
  return isListingOwner(listingId,userId);
}
export async function getOwnerAiPolicy(listingId:string):Promise<OwnerAiPolicy>{
  const row=await getDal().get("SELECT ai_enabled,visit_mode,availability_json,rules_json,updated_at FROM listing_ai_settings WHERE listing_id = ?",[listingId]);
  if(!row)return {...DEFAULT_OWNER_AI_POLICY,answers:{...DEFAULT_OWNER_AI_POLICY.answers}};
  try{
    const raw=JSON.parse(String(row.rules_json??"{}"));
    const availability=JSON.parse(String(row.availability_json??"[]"));
    const parsed=parseOwnerAiPolicy({
      aiEnabled:Number(row.ai_enabled)===1,visitMode:row.visit_mode,availability,
      answers:{pets:raw.pets??"",parking:raw.parking??"",notes:raw.notes??""},
    });
    return parsed?{...parsed,updatedAt:String(row.updated_at)}:{...DEFAULT_OWNER_AI_POLICY};
  }catch{return {...DEFAULT_OWNER_AI_POLICY};}
}
export async function saveOwnerAiPolicy(listingId:string,policy:OwnerAiPolicy):Promise<OwnerAiPolicy>{
  const stamp=now();
  await getDal().run(
    "INSERT INTO listing_ai_settings (listing_id,ai_enabled,visit_mode,availability_json,rules_json,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(listing_id) DO UPDATE SET ai_enabled=excluded.ai_enabled, visit_mode=excluded.visit_mode, availability_json=excluded.availability_json, rules_json=excluded.rules_json, updated_at=excluded.updated_at",
    [listingId,policy.aiEnabled?1:0,policy.visitMode,JSON.stringify(policy.availability),JSON.stringify(policy.answers),stamp],
  );
  return {...policy,updatedAt:stamp};
}
