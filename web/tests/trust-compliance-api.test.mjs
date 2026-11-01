import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const PORT=3217,BASE=`http://127.0.0.1:${PORT}`;
const DB=join(ROOT,"data",`trust-compliance-${process.pid}.db`);
const SECRET="trust-compliance-test-secret",WRITE="trust-compliance-write-test";
const makeToken=id=>mintTestToken(id,"실험계정","landlord",SECRET,Math.floor(Date.now()/1000)+3600);
const owner=makeToken("trust-owner"),stranger=makeToken("trust-visitor");
let server,listingId="";
async function api(path,method="GET",who=owner,body){
 const res=await fetch(BASE+path,{method,headers:{"Content-Type":"application/json",
  "x-write-token":WRITE,...(who?{Authorization:"Bearer "+who}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,body:await res.json()};
}
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:SECRET,
   WRITE_TOKEN:WRITE,MODERATOR_USER_IDS:"trust-owner",RATE_LIMIT_PER_MIN:"999",
   IDENTITY_BRIDGE_START_URL:"",IDENTITY_BRIDGE_API_KEY:"",IDENTITY_BRIDGE_CALLBACK_SECRET:""},
  stdio:"ignore",
 });
 let up=false;
 for(let i=0;i<70;i++){
  try{if((await fetch(BASE+"/api/health")).ok){up=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,450));
 }
 assert.equal(up,true,"Next server started");
 const r=await api("/api/listings","POST",owner,{
  title:"권한과 신고 테스트 매물",address:"서울특별시 가상구 예시로 3",
  tradeType:"월세",deposit:2000,rent:75,fee:5,area:35,moveIn:"2026-12-12",
  options:[],description:"허구로 생성한 통합 테스트",publisher:"테스트 계정",
 });
 assert.equal(r.status,201);listingId=r.body.id;
});
after(()=>{
 if(server)server.kill();
 for(const suffix of ["","-wal","-shm"]){try{rmSync(DB+suffix,{force:true});}catch{}}
});
test("계정 로그인과 법적 신원검증을 구분하고 무연동 상태에서는 인증이 거부된다",async()=>{
 const status=await api("/api/identity/status");
 assert.equal(status.status,200);
 assert.equal(status.body.accountAuthenticated,true);
 assert.equal(status.body.identityVerified,false);
 assert.equal(status.body.identityServiceAvailable,false);
 assert.equal((await api("/api/identity/start","POST")).status,503);
});
test("게시자 관계 자기진술은 권한을 확인하지만 소유권 검증으로 승격되지 않는다",async()=>{
 const url=`/api/owner/listings/${listingId}/authority`;
 assert.equal((await api(url,"GET",stranger)).status,403);
 assert.equal((await api(url,"PUT",stranger,{relation:"registered_owner",attested:true})).status,403);
 assert.equal((await api(url,"PUT",owner,{relation:"registered_owner",attested:false})).status,400);
 const r=await api(url,"PUT",owner,{relation:"registered_owner",attested:true});
 assert.equal(r.status,200);
 assert.equal(r.body.selfDeclared,true);
 assert.equal(r.body.relationVerified,false);
 assert.equal(r.body.verificationStatus,"unverified");
 const saved=await api(url);assert.equal(saved.body.relation,"registered_owner");
 assert.equal(saved.body.relationVerified,false);
});
test("신고 접수는 서버에 한 번 기록되며 재요청에 같은 접수번호를 돌려준다",async()=>{
 const url=`/api/listings/${listingId}/report`;
 assert.equal((await api(url,"POST",stranger,{category:"unknown"})).status,400);
 const a=await api(url,"POST",stranger,{category:"suspected_impersonation"});
 const b=await api(url,"POST",stranger,{category:"suspected_impersonation"});
 assert.equal(a.status,201);assert.equal(b.status,201);
 assert.equal(a.body.reportId,b.body.reportId);
 assert.equal(a.body.status,"received");
});
test("관리 API는 서버 환경변수로 지정한 검토자만 접근 가능",async()=>{
 const target="/api/internal/listing-reports";
 assert.equal((await api(target,"GET",stranger)).status,403);
 const list=await api(target);
 assert.equal(list.status,200);
 const row=list.body.reports.find(r=>r.listingId===listingId);
 assert.ok(row);assert.equal(row.category,"suspected_impersonation");
 const denied=await api(target,"PATCH",stranger,{id:row.id,status:"closed"});
 assert.equal(denied.status,403);
 const accepted=await api(target,"PATCH",owner,{id:row.id,status:"triaged"});
 assert.equal(accepted.status,200);assert.equal(accepted.body.status,"triaged");
});
