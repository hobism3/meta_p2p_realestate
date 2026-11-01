import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";
import {cleanEmail,cleanName,validPassword} from "../lib/auth-form.ts";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const PORT=3192,BASE="http://127.0.0.1:"+PORT;
const DB=join(ROOT,"data",`auth-signup-test-${process.pid}.db`);
const SECRET="mock-signup-acceptance-secret";
const CALLS=[];
let upstream,server;

const response=(res,status,body)=>{
 res.writeHead(status,{"Content-Type":"application/json"});
 res.end(JSON.stringify(body));
};
before(async()=>{
 upstream=createServer(async(req,res)=>{
  let payload={};
  const parts=[];
  for await(const x of req)parts.push(x);
  try{payload=JSON.parse(Buffer.concat(parts).toString("utf8")||"{}");}catch{}
  const url=new URL(req.url,"http://localhost");
  CALLS.push({path:url.pathname,params:url.searchParams.toString(),payload,method:req.method});
  if(url.pathname==="/auth/v1/signup"){
   if(payload.email==="disabled@example.test")return response(res,403,{error:"signup_disabled"});
   if(payload.email==="limited@example.test")return response(res,429,{error:"rate_limited"});
   if(payload.email==="ready@example.test")return response(res,200,{access_token:"mock.test.session",expires_in:3600,user:{id:"ready"}});
   return response(res,200,{user:{id:"unconfirmed"}});
  }
  if(url.pathname==="/auth/v1/recover"){
   return response(res,payload.email==="notfound@example.test"?404:200,{});
  }
  if(url.pathname==="/auth/v1/user" && req.method==="PUT"){
   if(req.headers.authorization!=="Bearer "+mintTestToken("test-id","tester","tenant",SECRET,1800000000))
     return response(res,401,{error:"expired"});
   return response(res,200,{id:"test-id"});
  }
  if(url.pathname==="/auth/v1/token")return response(res,200,{access_token:"valid.mocksignup.session",expires_in:3600,user:{id:"signed-in",email:payload.email}});
  return response(res,404,{error:"unexpected"});
 });
 await new Promise((resolve,reject)=>upstream.listen(0,"127.0.0.1",err=>err?reject(err):resolve()));
 const u=upstream.address();
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${u.port}`,SUPABASE_ANON_KEY:"fake-anon",SUPABASE_JWT_SECRET:SECRET,
   RATE_LIMIT_PER_MIN:"2000",DB_PATH:DB,VERCEL_ENV:"",WRITE_TOKEN:"",NEXT_PUBLIC_WRITE_TOKEN:""},stdio:"ignore",
 });
 let ok=false;
 for(let i=0;i<80;i++){
  try{if((await fetch(BASE+"/api/health")).ok){ok=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,350));
 }
 assert.equal(ok,true,"mock auth test server starts");
});
after(async()=>{
 if(server)server.kill();
 if(upstream)await new Promise(resolve=>upstream.close(resolve));
 for(const e of ["","-wal","-shm"])try{rmSync(DB+e,{force:true});}catch{}
});
const post=async(path,body,token)=>{
 const r=await fetch(BASE+path,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
};
test("입력 검증은 서버에서도 적용되며 잘못된 값은 Supabase에 전달하지 않는다",async()=>{
 const n=CALLS.length;
 for(const data of [
  {name:"홍길동",email:"invalid",password:"SecurePass2026"},
  {name:"a",email:"owner@example.test",password:"SecurePass2026"},
  {name:"홍길동",email:"owner@example.test",password:"short"},
  {name:"홍길동",email:"owner@example.test",password:"onlyletters"},
 ]){
  const r=await post("/api/auth/signup",data);
  assert.equal(r.status,400,JSON.stringify(r));
 }
 assert.equal(CALLS.length,n);
 assert.equal(cleanEmail(" OWNER@Example.test "),"owner@example.test");
 assert.equal(cleanName(" a "),null);
 assert.equal(validPassword("ThisIsLongButNoDigits"),false);
});
test("미인증 가입은 계정 생성 세션 없이 메일 확인을 안내한다",async()=>{
 const r=await post("/api/auth/signup",{name:"집주인 테스터",email:" Owner@Example.test ",password:"SecurePass2026"});
 assert.equal(r.status,201,JSON.stringify(r));
 assert.equal(r.body.requiresConfirmation,true);
 assert.equal("access_token" in r.body,false);
 const call=CALLS.at(-1);
 assert.equal(call.path,"/auth/v1/signup");
 assert.equal(call.payload.email,"owner@example.test");
 assert.equal(call.payload.data.name,"집주인 테스터");
 assert.match(new URLSearchParams(call.params).get("redirect_to"),/\/auth\/callback$/);
});
test("메일 인증이 비활성인 프로젝트에서는 실제 로그인 토큰을 반환한다",async()=>{
 const r=await post("/api/auth/signup",{name:"방문자 테스터",email:"ready@example.test",password:"SecurePass2026"});
 assert.equal(r.status,201);
 assert.equal(r.body.requiresConfirmation,false);
 assert.equal(r.body.access_token,"mock.test.session");
});
test("회원가입 제한 또는 너무 많은 요청은 일반화된 메시지로 처리한다",async()=>{
 const data=(email)=>({name:"방문자 테스터",email,password:"SecurePass2026"});
 assert.equal((await post("/api/auth/signup",data("disabled@example.test"))).status,403);
 assert.equal((await post("/api/auth/signup",data("limited@example.test"))).status,429);
});
test("복구 메일은 가입 여부와 무관하게 동일하게 안내한다",async()=>{
 const one=await post("/api/auth/recover",{email:"notfound@example.test"});
 const two=await post("/api/auth/recover",{email:"ready@example.test"});
 assert.equal(one.status,200);
 assert.equal(two.status,200);
 assert.deepEqual(one.body,two.body);
 const last=CALLS.at(-1);
 assert.match(new URLSearchParams(last.params).get("redirect_to"),/\/auth\/reset$/);
});
test("비밀번호 변경은 JWT 인증과 길이 검증 이후에만 진행된다",async()=>{
 const tok=mintTestToken("test-id","tester","tenant",SECRET,1800000000);
 assert.equal((await post("/api/auth/password",{password:"NewStrong2026"})).status,401);
 assert.equal((await post("/api/auth/password",{password:"short"},tok)).status,400);
 const changed=await post("/api/auth/password",{password:"NewStrong2026"},tok);
 assert.equal(changed.status,200,JSON.stringify(changed));
 assert.equal(CALLS.at(-1).path,"/auth/v1/user");
 assert.equal(CALLS.at(-1).payload.password,"NewStrong2026");
});
test("기존 이메일·비밀번호 로그인 API와 공존한다",async()=>{
 const r=await post("/api/auth/login",{email:"ready@example.test",password:"SecurePass2026"});
 assert.equal(r.status,200);
 assert.equal(r.body.access_token,"valid.mocksignup.session");
});
