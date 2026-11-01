import {bad,ok,readJson} from "@/lib/api";
import {validPassword} from "@/lib/auth-form";
import {authenticate} from "@/lib/auth";
export async function POST(req:Request):Promise<Response>{
  const base=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY;
  if(!base||!anon)return ok({error:"인증 서비스가 설정되지 않았습니다."},503);
  const auth=req.headers.get("authorization")??"";
  if(!auth.startsWith("Bearer "))return ok({error:"재설정 인증이 필요합니다."},401);
  const verified=await authenticate(req);
  if("error" in verified)return ok({error:"유효한 재설정 세션이 아닙니다."},401);
  const parsed=await readJson(req);
  if("err" in parsed)return parsed.err;
  if(!validPassword(parsed.value.password))return bad("영문과 숫자를 포함한 10~72자의 비밀번호를 입력해주세요.");
  try{
    const r=await fetch(base.replace(/\/+$/,"")+"/auth/v1/user",{
      method:"PUT",headers:{apikey:anon,Authorization:auth,"Content-Type":"application/json"},
      body:JSON.stringify({password:parsed.value.password}),cache:"no-store",signal:AbortSignal.timeout(15000),
    });
    if(!r.ok)return ok({error:r.status===401?"재설정 링크가 만료됐습니다.":"비밀번호 변경에 실패했습니다."},r.status===401?401:400);
    return ok({message:"비밀번호가 변경됐습니다. 새 비밀번호로 다시 로그인해주세요."});
  }catch{return ok({error:"인증 서버에 연결하지 못했습니다."},502);}
}
