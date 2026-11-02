import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const port=3294,base="http://127.0.0.1:"+port;
const db=join(root,"data","p14-rights-"+process.pid+".db"),secret="p14-registry-secret";
const owner=mintTestToken("owner-brief","임대인","landlord",secret,Math.floor(Date.now()/1000)+3600);
const stranger=mintTestToken("other-brief","제삼자","tenant",secret,Math.floor(Date.now()/1000)+3600);
const auth=(token=owner)=>({"content-type":"application/json","x-write-token":"p14-write",
 ...(token?{authorization:"Bearer "+token}:{})});
let app,listingId;
const rights=[{id:"doc-personal-identifier",kind:"mortgage",section:"을구",status:"cancelled",
 rankNumber:2,registrationDate:"2026-10-20",claimMaximumManwon:29000,
 creditorName:"비공개 권리자",privateOwner:"비공개 소유자"}];
before(async()=>{
 app=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(port)],{
  cwd:root,env:{...process.env,SUPABASE_URL:"",DATABASE_URL:"",SUPABASE_JWT_SECRET:secret,
   WRITE_TOKEN:"p14-write",DB_PATH:db,RATE_LIMIT_PER_MIN:"999"},stdio:"ignore"});
 let ready=false;
 for(let i=0;i<70;i++){try{if((await fetch(base+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,400));}
 assert.equal(ready,true,"next started with isolated SQLite");
 const r=await fetch(base+"/api/listings",{method:"POST",headers:auth(),
  body:JSON.stringify({title:"계약 전 검토 매물",address:"가상 테스트 주소",publisher:"게시자",
   tradeType:"월세",area:29,deposit:1200,rent:59,fee:5,moveIn:"2027-01-01"})});
 assert.equal(r.status,201);listingId=(await r.json()).id;
});
after(()=>{app?.kill();for(const suf of ["","-wal","-shm"])try{rmSync(db+suf,{force:true});}catch{}});
const url=()=>base+"/api/listings/"+listingId+"/rights-brief";
const publish=(token=owner,payload={})=>fetch(url(),{method:"POST",headers:auth(token),body:JSON.stringify({
  rights,issuedOn:"2026-10-20",confirmSharing:true,acceptUnverified:true,...payload,
 })});
test("missing summary never implies zero risks",async()=>{
 const result=await (await fetch(url())).json();
 assert.equal(result.available,false);
 assert.match(result.note,/안전하다는 뜻이 아닙니다/);
});
test("missing consent, third party, zero/future/unsafe records rejected",async()=>{
 assert.equal((await publish(null)).status,401);
 assert.equal((await publish(stranger)).status,403);
 assert.equal((await publish(owner,{acceptUnverified:false})).status,400);
 assert.equal((await publish(owner,{rights:[]})).status,400);
 assert.equal((await publish(owner,{issuedOn:"2099-01-01"})).status,400);
 assert.equal((await publish(owner,{rights:Array(21).fill(rights[0])})).status,400);
});
test("owner shares only minimal facts; no PII or verified cancellation leaked",async()=>{
 assert.equal((await publish()).status,201);
 const res=await fetch(url());assert.equal(res.status,200);
 const summary=await res.json();assert.equal(summary.available,true);
 assert.equal(summary.verified,false);assert.equal(summary.rights.length,1);
 assert.equal(summary.rights[0].kind,"mortgage");
 assert.equal(summary.rights[0].status,"unknown");
 assert.equal(summary.rights[0].claimMaximumManwon,29000);
 for(const sensitive of ["creditorName","privateOwner","비공개 권리자","doc-personal-identifier","owner-brief"])
  assert.equal(JSON.stringify(summary).includes(sensitive),false,sensitive+" must not leak");
});
test("only owner may withdraw the publicly shared summary",async()=>{
 assert.equal((await fetch(url(),{method:"DELETE",headers:auth(stranger)})).status,403);
 assert.equal((await fetch(url(),{method:"DELETE",headers:auth()})).status,200);
 assert.equal((await (await fetch(url())).json()).available,false);
});
