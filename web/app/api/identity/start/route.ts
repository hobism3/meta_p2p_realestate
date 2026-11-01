import {randomUUID} from "node:crypto";
import {guardWrite,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";
import {identityProviderConfig,safeVerificationUrl} from "@/lib/identity-provider-bridge";

export const runtime="nodejs";
export async function POST(req:Request):Promise<Response>{
 const guard=guardWrite(req);if(guard)return guard;
 const auth=await authenticate(req);if("error" in auth)return ok({error:auth.error},auth.status);
 const cfg=identityProviderConfig();
 if(!cfg)return ok({error:"계약된 본인확인기관이 아직 연결되지 않았습니다. 이메일 로그인만으로 본인확인 완료 처리하지 않습니다."},503);
 const userId=auth.identity.userId,stamp=now();
 const latest=await getDal().get(
  "SELECT status,expires_at FROM identity_provider_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
  [userId],
 );
 if(latest?.status==="pending"&&String(latest.expires_at)>stamp)
  return ok({error:"진행 중인 본인확인 요청이 있습니다."},409);
 const requestId=randomUUID();
 const expiry=new Date(Date.now()+10*60*1000).toISOString();
 await getDal().run(
  `INSERT INTO identity_provider_sessions
   (id,user_id,provider_session_id,status,created_at,expires_at)
   VALUES (?,?,?,'pending',?,?)`,
  [requestId,userId,requestId,stamp,expiry],
 );
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  let response:Response;
  try{
   response=await fetch(cfg.startUrl,{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${cfg.apiKey}`},
    body:JSON.stringify({requestId,purpose:"legal_name_identity",callbackUrl:cfg.callbackUrl,expiresInSeconds:600}),
    signal:controller.signal,cache:"no-store",
   });
  }finally{clearTimeout(timer);}
  if(!response.ok)throw Error("provider rejected");
  const result=await response.json() as Record<string,unknown>;
  const providerSessionId=typeof result.providerSessionId==="string"?result.providerSessionId:"";
  const verificationUrl=safeVerificationUrl(result.verificationUrl,cfg.allowedRedirectOrigin);
  if(!providerSessionId||providerSessionId.length>160||!verificationUrl)throw Error("invalid provider response");
  await getDal().run(
   "UPDATE identity_provider_sessions SET provider_session_id=? WHERE id=? AND status='pending'",
   [providerSessionId,requestId],
  );
  await getDal().run(
   `INSERT INTO user_identity_status(user_id,status,provider,updated_at)
    VALUES (?,'pending','external_bridge',?)
    ON CONFLICT(user_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at`,
   [userId,now()],
  );
  return ok({verificationUrl,expiresAt:expiry,message:"계약된 본인확인기관으로 이동합니다. 본인확인 결과는 기관의 서버 응답 검증 후에만 반영됩니다."},201);
 }catch{
  await getDal().run("UPDATE identity_provider_sessions SET status='rejected' WHERE id=? AND status='pending'",[requestId]);
  return ok({error:"본인확인기관 연결에 실패했습니다. 요청 상태는 미인증으로 유지합니다."},502);
 }
}
