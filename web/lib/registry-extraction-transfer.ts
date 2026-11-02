import type {RightEntry,RightKind,RightStatus,RightSection} from "./registry-rights-analysis";

/** Only de-identified, user-approved structured rights cross a same-tab navigation. */
export const REGISTRY_TRANSFER_KEY="directhome.registry.verified-input-transfer.v1";
export type TransferPayload={schema:"local-reviewed-rights-v1";rights:RightEntry[]};
const ALLOWED_KINDS=new Set<RightKind>(["mortgage","seizure","provisional_seizure","trust","lease_right","lease_registration","auction_commencement","provisional_registration","provisional_disposition","other"]);
const ALLOWED_STATUSES=new Set<RightStatus>(["active","cancelled","unknown"]);
const ALLOWED_SECTIONS=new Set<RightSection>(["갑구","을구","unknown"]);
const safeNum=(n:unknown,max:number):number|null=>
 typeof n==="number"&&Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
const safeDate=(date:unknown):string|undefined=>{
 if(typeof date!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(date))return undefined;
 const value=Date.parse(date+"T00:00:00Z");
 return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===date?date:undefined;
};
export function toSanitizedTransfer(entries:readonly RightEntry[]):TransferPayload{
 const rights:RightEntry[]=[];
 if(!Array.isArray(entries))return {schema:"local-reviewed-rights-v1",rights};
 for(const item of entries.slice(0,50)){
  if(!item||!ALLOWED_KINDS.has(item.kind)||!ALLOWED_STATUSES.has(item.status)||
     !ALLOWED_SECTIONS.has(item.section))continue;
  // Deterministic new IDs discard any untrusted PDF text and source identifiers.
  const id="extracted-"+(rights.length+1);
  rights.push({
   id,kind:item.kind as RightKind,status:item.status as RightStatus,
   section:item.section as RightSection,
   rankNumber:safeNum(item.rankNumber,100000),
   claimMaximumManwon:item.kind==="mortgage"?safeNum(item.claimMaximumManwon,100_000_000):null,
   registrationDate:safeDate(item.registrationDate),
   jointCollateralMentioned:item.kind==="mortgage"&&item.jointCollateralMentioned===true,
   cancellationPromised:item.cancellationPromised===true,
  });
 }
 return {schema:"local-reviewed-rights-v1",rights};
}
export function parseSanitizedTransfer(raw:unknown):TransferPayload|null{
 if(typeof raw!=="string"||raw.length>30000||raw.length<10)return null;
 try{
  const source=JSON.parse(raw) as Record<string,unknown>;
  if(!source||source.schema!=="local-reviewed-rights-v1"||!Array.isArray(source.rights)||
    source.rights.length>50)return null;
  const payload=toSanitizedTransfer(source.rights as RightEntry[]);
  if(payload.rights.length!==source.rights.length)return null;
  return payload;
 }catch{return null;}
}
