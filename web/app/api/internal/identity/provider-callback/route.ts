import {ok} from "@/lib/api";
import {getDal} from "@/lib/dal";
import {now} from "@/lib/db";
import {callbackSignatureOk,hashProviderSubject,identityProviderConfig} from "@/lib/identity-provider-bridge";

export const runtime="nodejs";
const SAFE_ID=/^[A-Za-z0-9_.:-]{1,160}$/;
async function boundedBody(req:Request):Promise<string|null>{
 if(!req.body)return null;
 const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>8192)return null;
   parts.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 }catch{return null;}finally{reader.releaseLock();}
}

/** Trusted identity bridge webhook, not a browser callback.
 * A vendor adapter MUST independently validate actual identity-provider evidence
 * before signing this payload with a server-only shared secret.
 */
export async function POST(req:Request):Promise<Response>{
 const cfg=identityProviderConfig();
 if(!cfg)return ok({error:"본인확인기관 미연결"},503);
 if(Number(req.headers.get("content-length")??"0")>8192)return ok({error:"요청 크기 초과"},413);
 const body=await boundedBody(req);
 if(body===null)return ok({error:"요청 본문이 없거나 크기가 초과됐습니다."},413);
 const stamp=req.headers.get("x-identity-timestamp")??"";
 const sig=req.headers.get("x-identity-signature")??"";
 if(!callbackSignatureOk(body,stamp,sig,cfg.callbackSecret))
  return ok({error:"인증 제공자 서명 검증 실패"},401);
 let data:Record<string,unknown>;
 try{const p:unknown=JSON.parse(body);if(!p||typeof p!=="object"||Array.isArray(p))throw Error();data=p as Record<string,unknown>;}
 catch{return ok({error:"잘못된 요청"},400);}
 const requestId=data.requestId,providerSessionId=data.providerSessionId,
  status=data.status,receipt=data.receiptReference,subject=data.subjectHandle;
 if(typeof requestId!=="string"||!SAFE_ID.test(requestId)||
  typeof providerSessionId!=="string"||!SAFE_ID.test(providerSessionId)||
  (status!=="verified"&&status!=="rejected"))return ok({error:"유효하지 않은 인증 결과"},400);
 if(status==="verified"&&(typeof receipt!=="string"||!SAFE_ID.test(receipt)||
   typeof subject!=="string"||!SAFE_ID.test(subject)))
  return ok({error:"인증 증명 정보 누락"},400);
 const timestamp=now();
 const outcome=await getDal().withTransaction(async tx=>{
  const session=await tx.get(
   `UPDATE identity_provider_sessions SET status=?,completed_at=?
    WHERE id=? AND provider_session_id=? AND status='pending' AND expires_at > ?
    RETURNING user_id`,
   [status,timestamp,requestId,providerSessionId,timestamp],
  );
  if(!session)return false; // expired, mismatched or duplicate callbacks never promote
  const userId=String(session.user_id);
  // Never persist the provider's raw identity identifier, document number,
  // birth date, phone number or name. Store a keyed hash of the receipt.
  const receiptHash=status==="verified"
   ?hashProviderSubject(String(receipt)+"|"+String(subject),cfg.subjectPepper):"";
  await tx.run(
   `INSERT INTO user_identity_status
    (user_id,status,provider,receipt_ref,verified_at,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      status=excluded.status,provider=excluded.provider,
      receipt_ref=excluded.receipt_ref,verified_at=excluded.verified_at,
      updated_at=excluded.updated_at`,
   [userId,status==="verified"?"provider_verified":"rejected",
    "external_bridge",receiptHash,status==="verified"?timestamp:"",timestamp],
  );
  return true;
 });
 return outcome?ok({accepted:true}):ok({error:"세션이 만료됐거나 이미 처리된 결과입니다."},409);
}
