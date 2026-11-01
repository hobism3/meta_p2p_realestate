import {guardRead,guardWrite,ok,readJson} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";

type Ctx={params:{id:string}};
const RELATIONS=new Set(["registered_owner","co_owner","landlord_non_owner","delegated_agent","other"]);
const UNVERIFIED={selfDeclared:false,relation:null,relationVerified:false,verificationStatus:"unverified"};

async function owner(req:Request,id:string){
 const auth=await authenticate(req);
 if("error" in auth)return {error:ok({error:auth.error},auth.status)} as const;
 const record=await getDal().get("SELECT owner_id FROM custom_listings WHERE id = ?",[id]);
 if(!record||String(record.owner_id??"")!==auth.identity.userId)
  return {error:ok({error:"이 매물의 등록 계정만 확인할 수 있습니다."},403)} as const;
 return {userId:auth.identity.userId} as const;
}

export async function GET(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 const auth=await owner(req,params.id);if("error" in auth)return auth.error;
 const r=await getDal().get(
  "SELECT relation,self_attested,attested_at,verification_status FROM listing_authority_claims WHERE listing_id = ? AND claimant_user_id = ?",
  [params.id,auth.userId],
 );
 if(!r)return ok(UNVERIFIED);
 return ok({
  selfDeclared:Number(r.self_attested)===1,relation:String(r.relation),
  attestedAt:String(r.attested_at),
  relationVerified:String(r.verification_status)==="provider_verified",
  verificationStatus:String(r.verification_status),
  note:"게시권한에 대한 본인의 진술이며, 등기상 소유권·위임장 진위 확인은 별개입니다.",
 });
}

export async function PUT(req:Request,{params}:Ctx):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const auth=await owner(req,params.id);if("error" in auth)return auth.error;
 const parsed=await readJson(req);if("err" in parsed)return parsed.err;
 const {relation,attested}=parsed.value;
 if(typeof relation!=="string"||!RELATIONS.has(relation)||attested!==true)
  return ok({error:"정확한 관계 유형과 게시권한 진술 확인이 필요합니다."},400);
 const timestamp=now();
 await getDal().run(
  `INSERT INTO listing_authority_claims
   (listing_id,claimant_user_id,relation,self_attested,attested_at,verification_status,reviewer_ref,reviewed_at)
   VALUES (?,?,?,?,?,'unverified','','')
   ON CONFLICT(listing_id) DO UPDATE SET
    claimant_user_id=excluded.claimant_user_id,relation=excluded.relation,
    self_attested=excluded.self_attested,attested_at=excluded.attested_at,
    verification_status='unverified',reviewer_ref='',reviewed_at=''`,
  [params.id,auth.userId,relation,1,timestamp],
 );
 return ok({selfDeclared:true,relation,attestedAt:timestamp,relationVerified:false,
  verificationStatus:"unverified",note:"게시권한 자기진술을 저장했습니다. 법적 신원 및 소유자·위임관계 인증은 아직 완료되지 않았습니다."});
}
