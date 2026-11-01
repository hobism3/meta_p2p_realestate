import {guardRead,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";

/** Account login is NOT legal-name identity verification. This endpoint
 * deliberately never infers a verified identity from Supabase/Google email.
 */
export async function GET(req:Request):Promise<Response>{
 const guard=guardRead(req);if(guard)return guard;
 const auth=await authenticate(req);if("error" in auth)return ok({error:auth.error},auth.status);
 const r=await getDal().get(
  "SELECT status,provider,verified_at FROM user_identity_status WHERE user_id = ?",
  [auth.identity.userId],
 );
 const status=r?String(r.status):"unverified";
 return ok({
  accountAuthenticated:true,
  identityStatus:status,
  identityVerified:status==="provider_verified",
  provider:status==="provider_verified"?String(r?.provider??""):"",
  verifiedAt:status==="provider_verified"?String(r?.verified_at??""):null,
  // A credentialed identity-provider integration must be independently tested
  // before the application can initiate or confirm a legal-name check.
  identityServiceAvailable:false,
  explanation:"이메일·Google 로그인은 실명 본인확인이 아닙니다. 외부 본인확인기관 연동과 심사를 마치기 전에는 검증 완료로 표시하지 않습니다.",
 });
}
