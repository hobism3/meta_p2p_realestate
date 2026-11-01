import {bad,ok,readJson} from "@/lib/api";
import {cleanEmail} from "@/lib/auth-form";
import {checkRate} from "@/lib/ratelimit";
export async function POST(req:Request):Promise<Response>{
  const base=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY;
  if(!base||!anon)return ok({error:"비밀번호 재설정 서비스가 설정되지 않았습니다."},503);
  const ip=req.headers.get("x-real-ip")??req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
  if(!checkRate("auth-recover:"+ip).ok)return ok({error:"요청이 많습니다. 잠시 후 다시 시도해주세요."},429);
  const parsed=await readJson(req);
  if("err" in parsed)return parsed.err;
  const email=cleanEmail(parsed.value.email);
  if(!email)return bad("올바른 이메일 주소를 입력해주세요.");
  try{
    const url=new URL(base.replace(/\/+$/,"")+"/auth/v1/recover");
    url.searchParams.set("redirect_to",new URL("/auth/reset",new URL(req.url).origin).toString());
    await fetch(url,{method:"POST",headers:{apikey:anon,"Content-Type":"application/json"},
      body:JSON.stringify({email}),cache:"no-store",signal:AbortSignal.timeout(15000)});
  }catch{return ok({error:"인증 서버에 연결하지 못했습니다."},502);}
  // Same response regardless of whether the email is registered.
  return ok({message:"가입된 이메일이라면 비밀번호 재설정 메일이 발송됩니다."});
}
