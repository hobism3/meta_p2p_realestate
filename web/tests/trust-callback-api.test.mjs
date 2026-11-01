import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHmac,randomUUID} from "node:crypto";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {mintTestToken} from "../lib/auth.ts";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),".."),PORT=3218;
const BASE=`http://127.0.0.1:${PORT}`,DB=join(ROOT,"data",`trust-provider-callback-${process.pid}.db`);
const SECRET="trust-provider-callback-auth",CALLBACK_KEY="a".repeat(48),PEPPER="b".repeat(48);
const who=mintTestToken("verified-test-subject","가상 인증 대상","landlord",SECRET,Math.floor(Date.now()/1000)+3600);
const sessionId=randomUUID(),providerSessionId="demo-provider-session-"+randomUUID();
let server;
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,
  env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:SECRET,RATE_LIMIT_PER_MIN:"999",
   IDENTITY_BRIDGE_ENABLED:"true",
   IDENTITY_BRIDGE_START_URL:"https://trusted-id.example.test/api/start",
   IDENTITY_BRIDGE_API_KEY:"c".repeat(48),
   IDENTITY_BRIDGE_CALLBACK_URL:"https://directhome.example.test/api/internal/identity/provider-callback",
   IDENTITY_BRIDGE_CALLBACK_SECRET:CALLBACK_KEY,
   IDENTITY_BRIDGE_SUBJECT_PEPPER:PEPPER,
   IDENTITY_BRIDGE_REDIRECT_ORIGIN:"https://trusted-id.example.test"},
  stdio:"ignore",
 });
 let ready=false;
 for(let i=0;i<70;i++){
  try{if((await fetch(BASE+"/api/health")).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,450));
 }
 assert.equal(ready,true);
 const db=new DatabaseSync(DB);
 db.prepare("INSERT INTO identity_provider_sessions(id,user_id,provider_session_id,status,created_at,expires_at) VALUES (?,?,?,'pending',?,?)")
  .run(sessionId,"verified-test-subject",providerSessionId,new Date().toISOString(),new Date(Date.now()+120000).toISOString());
 db.close();
});
after(()=>{if(server)server.kill();for(const suffix of ["","-wal","-shm"]){try{rmSync(DB+suffix,{force:true});}catch{}}});
function signed(body,forceBad=false){
 const text=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac("sha256",CALLBACK_KEY).update(timestamp+"."+text).digest("hex");
 return {text,timestamp,signature:forceBad?"0".repeat(64):signature};
}
async function cb(body,forceBad=false){
 const v=signed(body,forceBad);
 const r=await fetch(BASE+"/api/internal/identity/provider-callback",{
  method:"POST",headers:{"Content-Type":"application/json",
   "x-identity-timestamp":v.timestamp,"x-identity-signature":v.signature},body:v.text,
 });
 return {status:r.status,body:await r.json()};
}
const accepted={requestId:sessionId,providerSessionId,status:"verified",
 receiptReference:"fixture-not-real-vendor-4321",subjectHandle:"fixture-not-real-person"};
test("서명 위조로 인증상태를 바꿀 수 없다",async()=>{
 const forged=await cb(accepted,true);assert.equal(forged.status,401);
 const status=await fetch(BASE+"/api/identity/status",{headers:{Authorization:"Bearer "+who}}).then(r=>r.json());
 assert.equal(status.identityVerified,false);
});
test("테스트용 서명된 내부 제공자 receipt만 일회성 검증 승격한다",async()=>{
 const result=await cb(accepted);assert.equal(result.status,200);
 const status=await fetch(BASE+"/api/identity/status",{headers:{Authorization:"Bearer "+who}}).then(r=>r.json());
 assert.equal(status.identityVerified,true);
 assert.equal(status.provider,"external_bridge");
 const replay=await cb(accepted);assert.equal(replay.status,409);
});
