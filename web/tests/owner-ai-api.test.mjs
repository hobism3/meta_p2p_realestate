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

test("실제 매물: 등록 사실 응답 → 직접 확인 요청 → 집주인 답변 → 비활성화",async()=>{
 const create=await api("/api/deals/"+listingId+"/rooms","POST",stranger,{});
 assert.equal(create.status,201,JSON.stringify(create.body));
 const roomId=create.body.id;
 const meta=await api("/api/rooms/"+roomId,"GET",stranger);
 assert.equal(meta.body.demo,false);
 assert.equal(meta.body.ownerAgentEnabled,true);
 assert.equal(meta.body.viewerRole,"visitor");

 const send=async(text)=>{
  const x=await api("/api/rooms/"+roomId+"/messages","POST",stranger,{text});
  assert.equal(x.status,201,JSON.stringify(x.body));return x.body.id;
 };
 const invoke=async(trigger,who=stranger)=>api("/api/rooms/"+roomId+"/owner-agent/invoke","POST",who,{trigger_message_id:trigger});
 const pet=await send("고양이 키워도 되나요?");
 const answered=await invoke(pet);
 assert.equal(answered.status,200,JSON.stringify(answered.body));
 assert.equal(answered.body.outcome,"replied");
 assert.equal(answered.body.requestId,null);
 const dup=await invoke(pet);
 assert.equal(dup.body.messageId,answered.body.messageId);
 const msgs=await api("/api/rooms/"+roomId+"/messages","GET",stranger);
 assert.equal(msgs.body.filter(m=>m.author_type==="owner_agent").length,1);
 assert.match(msgs.body.find(m=>m.id===answered.body.messageId).text,/고양이 가능/);

 const price=await send("보증금 올려서 월세 깎아줄 수 있나요?");
 const review=await invoke(price);
 assert.equal(review.body.outcome,"handoff");
 assert.ok(review.body.requestId);
 assert.match((await api("/api/rooms/"+roomId+"/messages","GET",stranger)).body.find(m=>m.id===review.body.messageId).text,/집주인/);
 assert.equal((await invoke(price)).body.requestId,review.body.requestId);
 const inbox=await api("/api/owner/requests","GET",owner);
 assert.equal(inbox.status,200);
 assert.ok(inbox.body.some(r=>r.id===review.body.requestId && r.status==="pending"));
 const otherInbox=await api("/api/owner/requests","GET",stranger);
 assert.equal(otherInbox.body.length,0);
 const answerPath="/api/owner/requests/"+review.body.requestId+"/answer";
 assert.equal((await api(answerPath,"POST",stranger,{answer:"안 됩니다."})).status,404);
 const reply=await api(answerPath,"POST",owner,{answer:"보증금 2,000만원 / 월세 75만원을 제안합니다. 확정은 별도 확인해 주세요."});
 assert.equal(reply.status,200,JSON.stringify(reply.body));
 assert.equal((await api(answerPath,"POST",owner,{answer:"중복"})).status,409);
 const latest=await api("/api/rooms/"+roomId+"/messages","GET",stranger);
 const ownerReply=latest.body.find(m=>m.id===reply.body.messageId);
 assert.equal(ownerReply.author_type,"human");
 assert.equal(ownerReply.user_id,"owner-a");
 assert.match(ownerReply.text,/75만원/);
 assert.equal((await api("/api/owner/requests","GET",owner)).body.find(r=>r.id===review.body.requestId).status,"answered");
 assert.equal((await invoke(reply.body.messageId)).status,403);
 assert.equal((await invoke(price,owner)).status,403);
 assert.equal((await invoke(price,null)).status,401);

 const disable=await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:false,visitMode:"approval",availability:[],answers:{pets:"",parking:"",notes:""},
 });
 assert.equal(disable.status,200);
 const last=await send("주차 가능해요?");
 const paused=await invoke(last);
 assert.equal(paused.body.outcome,"disabled");
 assert.equal(paused.body.messageId,null);
});
