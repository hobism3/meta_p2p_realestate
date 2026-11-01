import { guardRead,guardWrite,ok,readJson,notFound } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { ownerListingExists, getOwnerAiPolicy, parseOwnerAiPolicy, saveOwnerAiPolicy } from "@/lib/owner-ai";

async function authorized(req:Request,id:string){
  const auth=await authenticate(req);
  if("error" in auth)return {error:ok({error:auth.error},auth.status)};
  if(!await ownerListingExists(id,auth.identity.userId))return {error:notFound("내 매물이 아닙니다")};
  return {};
}
export async function GET(req:Request,{params}:{params:{id:string}}){
  const g=guardRead(req);if(g)return g;
  const access=await authorized(req,params.id);if(access.error)return access.error;
  return ok(await getOwnerAiPolicy(params.id));
}
export async function PUT(req:Request,{params}:{params:{id:string}}){
  const g=guardWrite(req);if(g)return g;
  const access=await authorized(req,params.id);if(access.error)return access.error;
  const parsed=await readJson(req);if("err" in parsed)return parsed.err;
  const policy=parseOwnerAiPolicy(parsed.value);
  if(!policy)return ok({error:"AI 설정 또는 방문 가능 시간 형식 오류(시간 중복 포함)"},400);
  return ok(await saveOwnerAiPolicy(params.id,policy));
}
