import {guardRead,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {identityProviderConfig} from "@/lib/identity-provider-bridge";

export async function GET(req:Request):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 const auth=await authenticate(req);if("error" in auth)return ok({error:auth.error},auth.status);
 const [record,pending]=await Promise.all([
  getDal().get("SELECT status,provider,verified_at FROM user_identity_status WHERE user_id = ?",[auth.identity.userId]),
  getDal().get("SELECT status,expires_at FROM identity_provider_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1",[auth.identity.userId]),
 ]);
 const current=record?String(record.status):"unverified";
 const status=current==="pending"&&(!pending||pending.status!=="pending"||String(pending.expires_at)<=new Date().toISOString())
  ?"expired":current;
 return ok({
  accountAuthenticated:true,
  identityStatus:status,
  identityVerified:status==="provider_verified",
  provider:status==="provider_verified"?String(record?.provider??""):"",
  verifiedAt:status==="provider_verified"?String(record?.verified_at??""):null,
  identityServiceAvailable:!!identityProviderConfig(),
  explanation:"이메일·Google 로그인은 실명 본인확인이 아닙니다. 외부 본인확인기관이 서버 간 검증결과를 확인한 경우에만 실명 본인확인 완료로 표시합니다. 본인확인과 부동산 소유권 확인은 별개입니다.",
 });
}
