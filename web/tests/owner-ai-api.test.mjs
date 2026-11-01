import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";
const ROOT=join(dirname(fileURLToPath(import.meta.url)),".."), PORT=3163;
const DB=join(ROOT,"data",`owner-policy-test-${process.pid}.db`);
const URL=`http://127.0.0.1:${PORT}`, SECRET="owner-policy-test",WRITE="owner-write-test";
const token=(id)=>mintTestToken(id,"검증자","landlord",SECRET,Math.floor(Date.now()/1000)+3600);
const owner=token("owner-a"),stranger=token("owner-b");
let server,listingId="";
async function api(path,method="GET",who=owner,body){
 const r=await fetch(URL+path,{method,headers:{"Content-Type":"application/json","x-write-token":WRITE,
  ...(who?{Authorization:"Bearer "+who}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:SECRET,WRITE_TOKEN:WRITE,RATE_LIMIT_PER_MIN:"999"},
  stdio:"ignore",
 });
 let up=false;for(let i=0;i<70;i++){try{if((await fetch(URL+"/api/health")).ok){up=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,450));}
 assert.equal(up,true,"server start");
 const r=await api("/api/listings","POST",owner,{
   title:"집주인 설정 테스트",address:"서울시 가상주소 1",tradeType:"월세",
   deposit:1000,rent:60,salePrice:0,fee:0,area:32,moveIn:"2026-12-15",
   options:["에어컨"],description:"합성 테스트",publisher:"집주인",
 });
 assert.equal(r.status,201,JSON.stringify(r.body)); listingId=r.body.id;
});
after(()=>{if(server)server.kill();for(const suffix of ["","-wal","-shm"]){try{rmSync(DB+suffix,{force:true});}catch{}}});
test("소유자만 설정을 조회·수정하고 기본 AI는 꺼져 있다",async()=>{
 const list=await api("/api/owner/listings");
 assert.equal(list.status,200);assert.ok(list.body.some(x=>x.id===listingId));
 assert.equal((await api("/api/owner/listings","GET",stranger)).body.length,0);
 const path=`/api/owner/listings/${listingId}/ai`;
 const first=await api(path);assert.equal(first.status,200);assert.equal(first.body.aiEnabled,false);
 assert.equal((await api(path,"GET",stranger)).status,404);
 assert.equal((await api(path,"PUT",stranger,{...first.body,aiEnabled:true})).status,404);
 const policy={aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
 answers:{pets:"고양이 가능",parking:"1대 가능",notes:"반려견 별도 문의"}};
 const saved=await api(path,"PUT",owner,policy);
 assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.aiEnabled,true);
 const latest=await api(path);assert.equal(latest.body.answers.pets,"고양이 가능");assert.equal(latest.body.availability.length,1);
 const overlap=await api(path,"PUT",owner,{...policy,availability:[...policy.availability,{weekday:6,start:"17:00",end:"19:00"}]});
 assert.equal(overlap.status,400);
 const afterInvalid=await api(path);assert.equal(afterInvalid.body.availability.length,1);
 assert.equal((await api(path,"GET",null)).status,401);
});
