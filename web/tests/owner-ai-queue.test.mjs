import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {mintTestToken} from "../lib/auth.ts";
const ROOT=join(dirname(fileURLToPath(import.meta.url)),".."),PORT=3199;
const DB=join(ROOT,"data",`owner-ai-queue-${process.pid}.db`),URL=`http://127.0.0.1:${PORT}`;
const SECRET="p3-queue-test",WRITE="p3-write",CRON_SECRET="test-cron-secret-very-long-random";
const token=id=>mintTestToken(id,id,"tenant",SECRET,Math.floor(Date.now()/1000)+3600);
const owner=token("p3-owner"),visitor=token("p3-visitor"),outsider=token("p3-outside");
let server,listingId,roomId;
async function api(path,method="GET",who=visitor,body,extras={}){
 const r=await fetch(URL+path,{method,headers:{"Content-Type":"application/json","x-write-token":WRITE,
  ...(who?{Authorization:"Bearer "+who}:{}) ,...extras},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
function query(sql,...args){const d=new DatabaseSync(DB);
 try{return d.prepare(sql).all(...args);}finally{d.close();}}
function sql(sql,...args){const d=new DatabaseSync(DB);
 try{return d.prepare(sql).run(...args);}finally{d.close();}}
const jobs=()=>api("/api/rooms/"+roomId+"/owner-agent/jobs");
const send=text=>api("/api/rooms/"+roomId+"/messages","POST",visitor,{text});
const cron=(secret=CRON_SECRET)=>api("/api/cron/owner-agent","GET",null,undefined,{"Authorization":"Bearer "+secret});
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:SECRET,WRITE_TOKEN:WRITE,
   CRON_SECRET,RATE_LIMIT_PER_MIN:"999"},stdio:"ignore",
 });
 let ready=false;
 for(let i=0;i<80;i++){
  try{const r=await fetch(URL+"/api/health");if(r.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,350));
 }
 assert.equal(ready,true);
 const listing=await api("/api/listings","POST",owner,{
  title:"AI 서버 작업 검증",address:"합성 주소",tradeType:"월세",deposit:2000,rent:70,
  salePrice:0,fee:0,area:40,moveIn:"2026-12-01",options:[],description:"격리 검증",publisher:"집주인",
 });
 assert.equal(listing.status,201);listingId=listing.body.id;
 const policy=await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"approval",availability:[],answers:{pets:"고양이 가능",parking:"1대 가능",notes:""},
 });
 assert.equal(policy.status,200);
 const room=await api("/api/deals/"+listingId+"/rooms","POST",visitor,{});
 assert.equal(room.status,201);roomId=room.body.id;
});
after(()=>{if(server)server.kill();for(const suffix of ["","-wal","-shm"])try{rmSync(DB+suffix,{force:true});}catch{}});
test("보안: 원장·실제 응대 작업은 방 참여자만 조회, cron 비밀키 필수",async()=>{
 assert.equal((await api("/api/rooms/"+roomId+"/owner-agent/jobs","GET",outsider)).status,403);
 assert.equal((await api("/api/rooms/"+roomId+"/owner-agent/jobs","GET",null)).status,401);
 assert.equal((await api("/api/owner/ai-jobs","GET",null)).status,401);
 assert.equal((await api("/api/cron/owner-agent","GET",null)).status,401);
 assert.equal((await cron("wrong-secret")).status,401);
 const good=await cron();
 assert.equal(good.status,200,JSON.stringify(good.body));
 assert.equal(good.body.processed,0);
});
test("브라우저 후속 invoke 없어도 한 번의 메시지 POST가 집주인 AI 답변·원장을 남김",async()=>{
 const sent=await send("고양이 키워도 되나요?");
 assert.equal(sent.status,201,JSON.stringify(sent.body));
 assert.equal(sent.body.ownerAgentQueued,true);
 const rows=(await api("/api/rooms/"+roomId+"/messages")).body;
 const reps=rows.filter(x=>x.author_type==="owner_agent");
 assert.equal(reps.length,1);
 assert.match(reps[0].text,/고양이 가능/);
 const list=(await jobs()).body;
 assert.equal(list.length,1);
 assert.equal(list[0].status,"completed");
 assert.equal(list[0].attempts,1);
 const outbox=query("SELECT * FROM owner_ai_jobs WHERE room_id=?",roomId);
 assert.equal(outbox[0].trigger_msg_id,sent.body.id);
 assert.equal(outbox[0].reply_msg_id,reps[0].id);
 const again=await api("/api/rooms/"+roomId+"/owner-agent/invoke","POST",visitor,{trigger_message_id:sent.body.id});
 assert.equal(again.status,200);
 assert.equal(again.body.messageId,reps[0].id);
 const now=(await api("/api/rooms/"+roomId+"/messages")).body;
 assert.equal(now.filter(x=>x.author_type==="owner_agent").length,1,"legacy manual endpoint can't double reply");
});
test("가격 변경은 AI가 동의하지 않고 집주인 확인 요청함으로 전달",async()=>{
 const r=await send("보증금 올리면 월세 깎아줄 수 있나요?");
 assert.equal(r.status,201);
 const attention=await api("/api/owner/requests","GET",owner);
 assert.equal(attention.status,200);
 assert.ok(attention.body.some(x=>x.room_id===roomId&&x.status==="pending"));
 const list=(await jobs()).body;
 assert.equal(list.filter(x=>x.status==="completed").length,2);
 assert.equal((await api("/api/owner/requests","GET",outsider)).body.length,0);
});
test("고장 시 원문 보존·백오프·5회 후 집주인에게 실패 가시화·수동 재시도",async()=>{
 sql("UPDATE custom_listings SET options_json=? WHERE id=?","{BROKEN",listingId);
 const r=await send("주차 1대 가능한가요?");
 assert.equal(r.status,201,"original human text must survive agent failure");
 assert.equal(r.body.ownerAgentQueued,true);
 let row=query("SELECT * FROM owner_ai_jobs WHERE trigger_msg_id=?",r.body.id)[0];
 assert.equal(row.status,"pending");
 assert.equal(row.attempts,1);
 assert.ok(row.available_at>row.created_at);
 assert.equal((await api("/api/rooms/"+roomId+"/messages")).body.find(m=>m.id===r.body.id).author_type,"human");
 assert.equal((await cron()).body.processed,0,"backoff respected");
 for(let n=2;n<=5;n++){
  sql("UPDATE owner_ai_jobs SET available_at=? WHERE id=?",new Date(Date.now()-5000).toISOString(),row.id);
  const result=await cron();
  assert.equal(result.status,200);
  assert.equal(result.body.processed,1);
  row=query("SELECT * FROM owner_ai_jobs WHERE id=?",row.id)[0];
  assert.equal(row.attempts,n);
  assert.equal(row.status,n===5?"failed":"pending");
 }
 const fail=(await api("/api/owner/ai-jobs","GET",owner)).body.find(x=>x.id===row.id);
 assert.ok(fail);assert.equal(fail.status,"failed");
 assert.equal((await api("/api/owner/ai-jobs","GET",outsider)).body.length,0);
 assert.equal((await api("/api/owner/ai-jobs/"+row.id+"/retry","POST",outsider)).status,404);
 sql("UPDATE custom_listings SET options_json=? WHERE id=?","[]",listingId);
 const retry=await api("/api/owner/ai-jobs/"+row.id+"/retry","POST",owner);
 assert.equal(retry.status,200,JSON.stringify(retry.body));
 row=query("SELECT * FROM owner_ai_jobs WHERE id=?",row.id)[0];
 assert.equal(row.status,"completed");
 assert.equal(row.attempts,1);
 assert.equal((await api("/api/owner/ai-jobs","GET",owner)).body.length,0);
 const ownerReplies=(await api("/api/rooms/"+roomId+"/messages")).body.filter(x=>x.author_type==="owner_agent"&&/주차/.test(x.text));
 assert.equal(ownerReplies.length,1);
});
test("lease 만료 후 복구는 기존 AI 메시지를 다시 생성하지 않음",async()=>{
 const completed=query("SELECT * FROM owner_ai_jobs WHERE room_id=? AND status='completed'",roomId)[0];
 assert.ok(completed);
 const prior=(await api("/api/rooms/"+roomId+"/messages")).body.filter(x=>x.author_type==="owner_agent").length;
 sql("UPDATE owner_ai_jobs SET status='processing',lease_until=? WHERE id=?",new Date(Date.now()-5000).toISOString(),completed.id);
 const recovered=await cron();assert.equal(recovered.status,200);
 assert.equal(recovered.body.processed,1);
 const final=query("SELECT * FROM owner_ai_jobs WHERE id=?",completed.id)[0];
 assert.equal(final.status,"completed");
 const after=(await api("/api/rooms/"+roomId+"/messages")).body.filter(x=>x.author_type==="owner_agent").length;
 assert.equal(after,prior);
});
test("AI 비활성화 이후 메시지는 job 생성 안 됨; 직접 집주인 답변도 job 없음",async()=>{
 const policy=await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:false,visitMode:"manual",availability:[],answers:{pets:"",parking:"",notes:""},
 });
 assert.equal(policy.status,200);
 const disabled=await send("주차 가능한가요?");
 assert.equal(disabled.status,201);
 assert.equal(disabled.body.ownerAgentQueued,false);
 assert.equal(query("SELECT * FROM owner_ai_jobs WHERE trigger_msg_id=?",disabled.body.id).length,0);
 const human=await api("/api/rooms/"+roomId+"/messages","POST",owner,{text:"반려동물은 직접 확인해드리겠습니다."});
 assert.equal(human.status,201);
 assert.equal(human.body.ownerAgentQueued,false);
});

test("설정 변경 뒤 대기 중이던 작업은 새 정책으로 뒤늦게 응대하지 않음",async()=>{
 const enabled=await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"approval",availability:[],answers:{pets:"고양이 불가",parking:"주차 금지",notes:""},
 });
 assert.equal(enabled.status,200);
 sql("UPDATE custom_listings SET options_json=? WHERE id=?","{BAD",listingId);
 const sent=await send("면적이 궁금합니다.");
 assert.equal(sent.status,201);
 const initial=query("SELECT * FROM owner_ai_jobs WHERE trigger_msg_id=?",sent.body.id)[0];
 assert.equal(initial.status,"pending");
 sql("UPDATE custom_listings SET options_json=? WHERE id=?","[]",listingId);
 const updatedPolicy=await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"approval",availability:[],answers:{pets:"고양이 가능",parking:"주차 가능",notes:""},
 });
 assert.equal(updatedPolicy.status,200);
 // Ensure the version differs even when successive updates happen in one ms.
 sql("UPDATE listing_ai_settings SET updated_at=? WHERE listing_id=?",
  new Date(Date.now()+5000).toISOString(),listingId);
 sql("UPDATE owner_ai_jobs SET available_at=? WHERE id=?",new Date(Date.now()-5000).toISOString(),initial.id);
 const result=await cron();
 assert.equal(result.status,200);
 assert.equal(result.body.disabled,1);
 const after=query("SELECT status FROM owner_ai_jobs WHERE id=?",initial.id)[0];
 assert.equal(after.status,"disabled");
 const replies=(await api("/api/rooms/"+roomId+"/messages")).body.filter(m=>m.author_type==="owner_agent");
 assert.ok(replies.every(m=>m.text!=="등록된 면적은 40㎡입니다."));
});
