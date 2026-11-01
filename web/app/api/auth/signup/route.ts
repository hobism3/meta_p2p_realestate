import {bad,ok,readJson} from "@/lib/api";
import {checkRate} from "@/lib/ratelimit";
import {authFailure,cleanEmail,cleanName,validPassword} from "@/lib/auth-form";

export async function POST(req:Request):Promise<Response>{
  const base=process.env.SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY;
  if(!base||!anon)return ok({error:"회원가입 서비스가 설정되지 않았습니다."},503);
  const ip=req.headers.get("x-real-ip")??req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
  const permitted=checkRate("auth-signup:"+ip);
  if(!permitted.ok)return ok({error:"가입 요청이 많습니다. 잠시 후 다시 시도해주세요."},429);
  const parsed=await readJson(req);
  if("err" in parsed)return parsed.err;
  const email=cleanEmail(parsed.value.email);
  const name=cleanName(parsed.value.name);
  const password=parsed.value.password;
  if(!email)return bad("올바른 이메일 주소를 입력해주세요.");
  if(!name)return bad("이름은 2~40자로 입력해주세요.");
  if(!validPassword(password))return bad("비밀번호는 영문과 숫자를 포함해 10~72자로 입력해주세요.");

  let r:Response;
  try{
    // Confirm links return to the same deploy. Add this URL to Supabase
    // Auth -> URL Configuration -> Redirect URLs to permit confirmations.
    const redirect=new URL("/auth/callback",new URL(req.url).origin).toString();
    const url=new URL(base.replace(/\/+$/,"")+"/auth/v1/signup");
    url.searchParams.set("redirect_to",redirect);
    r=await fetch(url,{method:"POST",cache:"no-store",headers:{
      apikey:anon,"Content-Type":"application/json",
    },body:JSON.stringify({email,password,data:{name}}),signal:AbortSignal.timeout(15000)});
  }catch{return ok({error:"인증 서버 연결에 실패했습니다."},502);}
  const result=await r.json().catch(()=>({})) as {
    access_token?:string;expires_in?:number;
    user?:{id?:string;email?:string};
  };
  if(!r.ok){
    const err=authFailure(r.status);
    return ok({error:err.message},err.status);
  }
  // Supabase returns a session only when email confirmation is disabled.
  // Never treat a user object alone as evidence of an authenticated account.
  if(result.access_token)return ok({
    requiresConfirmation:false,access_token:result.access_token,
    expires_in:result.expires_in??3600,
  },201);
  return ok({
    requiresConfirmation:true,
    message:"가입 요청이 접수됐습니다. 인증 메일이 도착하면 링크를 눌러 계정을 확인해주세요. 이미 가입된 이메일에도 같은 안내가 표시될 수 있습니다.",
  },201);
}
