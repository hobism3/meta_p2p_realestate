import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";
import {DatabaseSync} from "node:sqlite";
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

test("방문 신청→슬롯 중복 차단→집주인 승인→취소·재신청",async()=>{
 const creation=await api("/api/listings","POST",owner,{
   title:"예약 충돌 검증 매물",address:"수원 테스트 주소",tradeType:"월세",
   deposit:1500,rent:70,salePrice:0,fee:4,area:42,moveIn:"2026-12-01",
   options:[],description:"합성 예약 검증",publisher:"임대인",
 });
 assert.equal(creation.status,201,JSON.stringify(creation.body));
 const lid=creation.body.id;
 const setup=await api("/api/owner/listings/"+lid+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
  answers:{pets:"고양이 가능",parking:"",notes:""},
 });
 assert.equal(setup.status,200,JSON.stringify(setup.body));
 const another=mintTestToken("visitor-c","다른 임차인","tenant",SECRET,Math.floor(Date.now()/1000)+3600);
 const a=await api("/api/deals/"+lid+"/rooms","POST",stranger,{});
 const b=await api("/api/deals/"+lid+"/rooms","POST",another,{});
 assert.equal(a.status,201);assert.equal(b.status,201);
 const ra=a.body.id,rb=b.body.id;
 let date="";
 for(let i=1;i<=8;i++){
  const future=new Date(Date.now()+i*86400000);
  const value=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(future);
  if(new Date(value+"T00:00:00Z").getUTCDay()===6){date=value;break;}
 }
 assert.ok(date);
 const p="/api/rooms/"+ra+"/bookings";
 assert.equal((await api(p+"?date="+date,"GET",stranger)).body.available.includes("13:00"),true);
 assert.equal((await api(p+"?date="+date,"GET",another)).status,404);
 const post=await api(p,"POST",stranger,{date,time:"13:00"});
 assert.equal(post.status,201,JSON.stringify(post.body));
 const id=post.body.id;
 assert.equal(post.body.status,"requested");
 const conflict=await api("/api/rooms/"+rb+"/bookings","POST",another,{date,time:"13:30"});
 assert.equal(conflict.status,409,JSON.stringify(conflict.body));
 assert.equal((await api(p+"?date="+date,"GET",stranger)).body.available.includes("13:30"),false);
 assert.equal((await api(p,"POST",stranger,{date,time:"13:15"})).status,400);
 assert.equal((await api(p,"POST",stranger,{date,time:"23:00"})).status,400);
 const action="/api/rooms/"+ra+"/bookings/"+id;
 assert.equal((await api(action,"PATCH",stranger,{action:"confirm"})).status,409);
 assert.equal((await api(action,"PATCH",another,{action:"confirm"})).status,404);
 const own=await api("/api/owner/bookings","GET",owner);
 assert.equal(own.status,200);
 assert.ok(own.body.some(x=>x.id===id&&x.status==="requested"));
 assert.equal((await api("/api/owner/bookings","GET",stranger)).body.length,0);
 const confirmed=await api(action,"PATCH",owner,{action:"confirm"});
 assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
 assert.equal(confirmed.body.status,"confirmed");
 assert.equal((await api(action,"PATCH",owner,{action:"decline"})).status,409);
 const msg=(await api("/api/rooms/"+ra+"/messages","GET",stranger)).body;
 assert.ok(msg.some(m=>m.author_type==="booking_notice"&&m.text.includes("예약이 확정된 것이 아닙니다")));
 assert.ok(msg.some(m=>m.author_type==="booking_notice"&&m.text.includes("방문 확정")));
 const cancelled=await api(action,"PATCH",stranger,{action:"cancel"});
 assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));
 assert.equal((await api(action,"PATCH",stranger,{action:"cancel"})).status,409);
 const reused=await api("/api/rooms/"+rb+"/bookings","POST",another,{date,time:"13:00"});
 assert.equal(reused.status,201,JSON.stringify(reused.body));
 const declined=await api("/api/rooms/"+rb+"/bookings/"+reused.body.id,"PATCH",owner,{action:"decline"});
 assert.equal(declined.status,200);
 const legacy=await api("/api/rooms/"+ra+"/visits","POST",stranger,{date,time:"14:00"});
 assert.equal(legacy.status,201);
 assert.equal((await api("/api/rooms/"+ra+"/visits/"+legacy.body.id,"PATCH",stranger,{status:"수락됨"})).status,403);
 const manual=await api("/api/owner/listings/"+lid+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"manual",availability:[{weekday:6,start:"13:00",end:"18:00"}],
  answers:{pets:"",parking:"",notes:""},
 });
 assert.equal(manual.status,200);
 assert.equal((await api(p,"POST",stranger,{date,time:"15:00"})).status,409);
});

test("승인 대기 24시간 만료 → 다른 사용자 슬롯 재사용, 중복 신청 제한, 과거 승인 거부",async()=>{
 const listed=await api("/api/listings","POST",owner,{
   title:"만료 검증 매물",address:"시연 테스트 주소",tradeType:"월세",deposit:1500,rent:70,salePrice:0,
   fee:0,area:40,moveIn:"2026-12-01",publisher:"임대인",options:[],description:"합성 데이터",
 });
 assert.equal(listed.status,201,JSON.stringify(listed.body));
 const lid=listed.body.id;
 const set=await api("/api/owner/listings/"+lid+"/ai","PUT",owner,{
   aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
   answers:{pets:"",parking:"",notes:""},
 });
 assert.equal(set.status,200,JSON.stringify(set.body));
 const another=mintTestToken("exp-visitor","다른 방문자","tenant",SECRET,Math.floor(Date.now()/1000)+3600);
 const x=await api("/api/deals/"+lid+"/rooms","POST",stranger,{});
 const y=await api("/api/deals/"+lid+"/rooms","POST",another,{});
 assert.equal(x.status,201);assert.equal(y.status,201);
 const r1=x.body.id,r2=y.body.id;
 let date="";
 for(let i=1;i<=8;i++){
   const future=new Date(Date.now()+i*86400000);
   const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(future);
   if(new Date(day+"T00:00:00Z").getUTCDay()===6){date=day;break;}
 }
 assert.ok(date);
 const endpoint="/api/rooms/"+r1+"/bookings";
 const request=await api(endpoint,"POST",stranger,{date,time:"13:00"});
 assert.equal(request.status,201,JSON.stringify(request.body));
 const id=request.body.id;
 const samePerson=await api(endpoint,"POST",stranger,{date,time:"15:00"});
 assert.equal(samePerson.status,409,JSON.stringify(samePerson.body));
 assert.match(samePerson.body.error,/진행 중인 방문 예약/);
 const stillLocked=await api("/api/rooms/"+r2+"/bookings","POST",another,{date,time:"13:30"});
 assert.equal(stillLocked.status,409);
 const db=new DatabaseSync(DB);
 try{
   db.prepare("UPDATE owner_visit_bookings SET created_at=? WHERE id=?")
     .run(new Date(Date.now()-26*3600_000).toISOString(),id);
 }finally{db.close();}
 const refreshed=await api(endpoint+"?date="+date,"GET",stranger);
 assert.equal(refreshed.status,200,JSON.stringify(refreshed.body));
 const expired=refreshed.body.bookings.find(b=>b.id===id);
 assert.equal(expired.status,"expired");
 assert.equal(expired.decided_by,"system:expired");
 assert.ok(refreshed.body.available.includes("13:00"));
 const repeated=await api(endpoint+"?date="+date,"GET",stranger);
 assert.equal(repeated.body.bookings.find(b=>b.id===id).status,"expired");
 const notices=(await api("/api/rooms/"+r1+"/messages","GET",stranger)).body
   .filter(m=>m.author_type==="booking_notice"&&m.text.includes("자동 만료"));
 assert.equal(notices.length,1,"같은 만료 이벤트를 중복 기록하지 않음");
 const deny=await api(endpoint+"/"+id,"PATCH",owner,{action:"confirm"});
 assert.equal(deny.status,409);
 const ownerList=await api("/api/owner/bookings","GET",owner);
 assert.equal(ownerList.body.find(b=>b.id===id).status,"expired");
 const open=await api("/api/rooms/"+r2+"/bookings","POST",another,{date,time:"13:00"});
 assert.equal(open.status,201,JSON.stringify(open.body));
 const confirm=await api("/api/rooms/"+r2+"/bookings/"+open.body.id,"PATCH",owner,{action:"confirm"});
 assert.equal(confirm.status,200);
 // Confirmation is permanent until explicitly cancelled; expiration only targets requested.
 const db2=new DatabaseSync(DB);
 try{db2.prepare("UPDATE owner_visit_bookings SET created_at=? WHERE id=?")
     .run(new Date(Date.now()-48*3600_000).toISOString(),open.body.id);
 }finally{db2.close();}
 const later=await api("/api/rooms/"+r2+"/bookings?date="+date,"GET",another);
 assert.equal(later.body.bookings.find(b=>b.id===open.body.id).status,"confirmed");
 assert.equal((await api("/api/rooms/"+r2+"/bookings","POST",another,{date,time:"15:00"})).status,409);
 const cancel=await api("/api/rooms/"+r2+"/bookings/"+open.body.id,"PATCH",another,{action:"cancel"});
 assert.equal(cancel.status,200);
 assert.equal((await api(endpoint,"POST",stranger,{date,time:"13:00"})).status,201);
});

test("동시 방문 신청 두 건은 겹치는 한 슬롯에서 하나만 성공",async()=>{
 const l=await api("/api/listings","POST",owner,{
  title:"경합 검증 매물",address:"합성 주소",tradeType:"월세",deposit:900,rent:55,salePrice:0,
  fee:0,area:40,moveIn:"2026-12-01",publisher:"집주인",options:[],description:"경합 검증",
 });
 assert.equal(l.status,201);
 const lid=l.body.id;
 assert.equal((await api("/api/owner/listings/"+lid+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
  answers:{pets:"",parking:"",notes:""},
 })).status,200);
 const other=mintTestToken("parallel-visitor","방문자 C","tenant",SECRET,Math.floor(Date.now()/1000)+3600);
 const ra=await api("/api/deals/"+lid+"/rooms","POST",stranger,{});
 const rb=await api("/api/deals/"+lid+"/rooms","POST",other,{});
 assert.equal(ra.status,201);assert.equal(rb.status,201);
 let date="";
 for(let i=1;i<=8;i++){
  const t=new Date(Date.now()+i*86400000);
  const d=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(t);
  if(new Date(d+"T00:00:00Z").getUTCDay()===6){date=d;break;}
 }
 const a="/api/rooms/"+ra.body.id+"/bookings",b="/api/rooms/"+rb.body.id+"/bookings";
 const result=await Promise.all([
  api(a,"POST",stranger,{date,time:"13:00"}),
  api(b,"POST",other,{date,time:"13:00"}),
 ]);
 assert.deepEqual(result.map(x=>x.status).sort((x,y)=>x-y),[201,409],JSON.stringify(result));
 const owned=await api("/api/owner/bookings","GET",owner);
 const bookings=owned.body.filter(x=>x.listing_id===lid&&x.status==="requested");
 assert.equal(bookings.length,1);
});
