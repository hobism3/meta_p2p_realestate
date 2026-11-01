import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {mintTestToken} from "../lib/auth.ts";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),".."),PORT=3194;
const DB=join(ROOT,"data",`real-jiptok-p2-${process.pid}.db`);
const BASE=`http://127.0.0.1:${PORT}`,SECRET="jiptok-p2-test",WRITE="jiptok-write";
const token=(id)=>mintTestToken(id,id,"tenant",SECRET,Math.floor(Date.now()/1000)+3600);
const owner=token("real-jiptok-owner"),visitor=token("real-jiptok-visitor"),outsider=token("real-jiptok-stranger");
let server,roomId,listingId;
async function api(path,method="GET",who=visitor,body){
 const r=await fetch(BASE+path,{method,headers:{"Content-Type":"application/json","x-write-token":WRITE,
  ...(who?{Authorization:"Bearer "+who}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
const msg=async(text,who=visitor)=>api("/api/rooms/"+roomId+"/messages","POST",who,{text});
const messages=async()=> (await api("/api/rooms/"+roomId+"/messages")).body;
const state=async()=>(await api("/api/rooms/"+roomId+"/transaction-state")).body;
const proposals=async()=>(await api("/api/rooms/"+roomId+"/proposals")).body;
const stage=(s,key)=>s.stages.find(st=>st.key===key);
const assistant=(rows)=>rows.filter(m=>m.author_type==="assistant");
function futureSaturday(){
 for(let i=1;i<=8;i++){
  const d=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"})
   .format(new Date(Date.now()+i*86400000));
  if(new Date(d+"T00:00:00Z").getUTCDay()===6)return d;
 }
 throw Error("missing saturday");
}
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:SECRET,WRITE_TOKEN:WRITE,RATE_LIMIT_PER_MIN:"999"},stdio:"ignore",
 });
 let up=false;
 for(let i=0;i<80;i++){try{if((await fetch(BASE+"/api/health")).ok){up=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,350));}
 assert.equal(up,true,"test server");
 const listing=await api("/api/listings","POST",owner,{
  title:"집톡이 실거래 테스트",address:"검증용 합성 주소",tradeType:"월세",
  deposit:1800,rent:78,salePrice:0,fee:0,area:40,moveIn:"2026-12-01",
  options:[],publisher:"집주인",description:"자동 가이드 검증",
 });
 assert.equal(listing.status,201,JSON.stringify(listing.body));listingId=listing.body.id;
 assert.equal((await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:false,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
  answers:{pets:"고양이 한 마리 가능",parking:"",notes:""},
 })).status,200);
 const room=await api("/api/deals/"+listingId+"/rooms","POST",visitor,{});
 assert.equal(room.status,201,JSON.stringify(room.body));roomId=room.body.id;
});
after(()=>{if(server)server.kill();for(const e of ["","-wal","-shm"])try{rmSync(DB+e,{force:true});}catch{}});
test("실거래 첫 발화에 집톡이만 한 번 참여하며 재인사·외부인 접근 금지",async()=>{
 assert.equal((await api("/api/rooms/"+roomId+"/messages","POST",outsider,{text:"외부인"})).status,403);
 const hello=await msg("안녕하세요");
 assert.equal(hello.status,201,JSON.stringify(hello.body));
 const one=await messages();
 assert.equal(assistant(one).length,1);
 assert.match(assistant(one)[0].text,/집톡이/);
 assert.equal((await msg("네 감사합니다")).status,201);
 const two=await messages();
 assert.equal(assistant(two).length,1,"인사만으로 매 메시지 발화 금지");
 assert.equal((await api("/api/rooms/"+roomId+"/messages","GET",outsider)).status,403);
 assert.equal((await api("/api/rooms/"+roomId+"/messages","GET",null)).status,401);
});
test("고양이 문의는 확정 금지, 집주인 허용 발언에서 확인 카드 자동 생성",async()=>{
 const q=await msg("고양이 키워도 되나요?");
 assert.equal(q.status,201);
 assert.equal(stage(await state(),"living").confirmedValue,null);
 const before=await proposals();
 assert.equal(before.proposals.length,0);
 const ownerReply=await msg("고양이 한 마리는 키워도 괜찮습니다.",owner);
 assert.equal(ownerReply.status,201,JSON.stringify(ownerReply.body));
 const after=await proposals();
 const p=after.proposals.find(p=>p.name==="옵션");
 assert.ok(p,JSON.stringify(after));
 assert.equal(p.status,"proposed");
 assert.equal(p.value,"고양이 한 마리 허용");
 assert.ok(p.card_msg_id,"Jiptok group message anchors inline proposal card");
 assert.ok((await messages()).some(m=>m.id===p.card_msg_id&&m.author_type==="assistant"));
 assert.equal(stage(await state(),"living").status,"pending");
 const first=await api("/api/rooms/"+roomId+"/proposals/"+p.id+"/decide","POST",visitor,
  {decision:"agree",version:p.version});
 assert.equal(first.status,200,JSON.stringify(first.body));
 assert.equal(first.body.status,"proposed");
 assert.equal(stage(await state(),"living").confirmedValue,null);
 const final=await api("/api/rooms/"+roomId+"/proposals/"+p.id+"/decide","POST",owner,
  {decision:"agree",version:p.version});
 assert.equal(final.status,200);
 assert.equal(final.body.status,"agreed");
 assert.equal(stage(await state(),"living").status,"partial");
 assert.ok((await messages()).some(m=>m.author_type==="assistant"&&/두 분 모두 동의/.test(m.text)));
});
test("가격 문의는 동의되지 않음; 명시적 제안이 생겨도 확인 전 pending",async()=>{
 const q=await msg("보증금을 3천으로 올리면 월세 60 되나요?");
 assert.equal(q.status,201);
 const before=await proposals();
 assert.equal(before.proposals.filter(p=>p.name==="월세 조건").length,0);
 const offered=await msg("보증금 3,000만원 / 월세 68만원이면 괜찮습니다.",owner);
 assert.equal(offered.status,201,JSON.stringify(offered.body));
 const now=await proposals(),p=now.proposals.find(p=>p.name==="월세 조건");
 assert.ok(p,JSON.stringify(now));
 assert.equal(p.value,"보증금 3,000만원/월세 68만원");
 assert.equal(p.status,"proposed");
 assert.deepEqual(p.source_msg_ids,[offered.body.id]);
 assert.ok(p.card_msg_id);
 const source=(await messages()).find(m=>m.id===p.card_msg_id);
 assert.equal(source.author_type,"assistant");
 assert.match(source.text,/두 분이 각각 확인/);
 assert.equal(stage(await state(),"price").status,"pending");
 assert.equal(stage(await state(),"price").confirmedValue,null);
 const repeat=await msg("보증금 3,000만원 / 월세 68만원이면 괜찮습니다.",owner);
 assert.equal(repeat.status,201);
 const all=await proposals();
 assert.equal(all.proposals.filter(x=>x.name==="월세 조건").length,1);
 const decision1=await api("/api/rooms/"+roomId+"/proposals/"+p.id+"/decide","POST",visitor,
   {decision:"agree",version:p.version});
 assert.equal(decision1.status,200);
 assert.equal(stage(await state(),"price").status,"pending");
 const decision2=await api("/api/rooms/"+roomId+"/proposals/"+p.id+"/decide","POST",owner,
   {decision:"agree",version:p.version});
 assert.equal(decision2.status,200,JSON.stringify(decision2.body));
 assert.equal(decision2.body.status,"agreed");
 assert.equal(stage(await state(),"price").status,"confirmed");
 const notes=(await messages()).filter(m=>m.author_type==="assistant"&&/두 분 모두 동의/.test(m.text));
 assert.ok(notes.some(n=>/월세 조건/.test(n.text)),"Jiptok guides next step after verified agreement");
});
test("방문은 요청/소유자 승인 전 미확정, 승인 후 집톡이 다음 절차 안내",async()=>{
 const date=futureSaturday();
 const sent=await api("/api/rooms/"+roomId+"/bookings","POST",visitor,{date,time:"14:00"});
 assert.equal(sent.status,201,JSON.stringify(sent.body));
 assert.equal(stage(await state(),"visit").status,"pending");
 const before=await messages();
 const approved=await api("/api/rooms/"+roomId+"/bookings/"+sent.body.id,"PATCH",owner,{action:"confirm"});
 assert.equal(approved.status,200,JSON.stringify(approved.body));
 assert.equal(stage(await state(),"visit").status,"confirmed");
 const rows=await messages();
 assert.ok(rows.length>before.length);
 assert.ok(rows.some(m=>m.author_type==="assistant"&&m.text.includes("집주인 승인")));
});
test("집톡이 영속 이벤트는 방·토픽당 중복 기록 없음",()=>{
 const db=new DatabaseSync(DB);
 try{
  const rows=db.prepare("SELECT room_id,event_kind,event_key,COUNT(*) AS count FROM real_jiptok_events GROUP BY room_id,event_kind,event_key").all();
  assert.ok(rows.length>=4);
  for(const row of rows)assert.equal(row.count,1);
  const p=db.prepare("SELECT COUNT(*) AS n FROM room_proposals WHERE room_id=? AND name='월세 조건'").get(roomId);
  assert.equal(p.n,1);
 }finally{db.close();}
});

test("집주인 AI 대리인의 사전 반려동물 정책은 제안으로 남고 양측 동의 전 미확정",async()=>{
 const listing=await api("/api/listings","POST",owner,{
  title:"집주인 AI 대리 옵션 테스트",address:"합성 주소",tradeType:"월세",
  deposit:1500,rent:65,salePrice:0,fee:0,area:40,moveIn:"2026-12-01",
  options:[],publisher:"집주인",description:"정책 근거 검증",
 });
 assert.equal(listing.status,201,JSON.stringify(listing.body));
 const lid=listing.body.id;
 const setup=await api("/api/owner/listings/"+lid+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"manual",availability:[],
  answers:{pets:"고양이 두 마리 가능",parking:"",notes:""},
 });
 assert.equal(setup.status,200,JSON.stringify(setup.body));
 const room=await api("/api/deals/"+lid+"/rooms","POST",visitor,{});
 assert.equal(room.status,201);
 const rid=room.body.id;
 const question=await api("/api/rooms/"+rid+"/messages","POST",visitor,{text:"고양이 두 마리 키워도 되나요?"});
 assert.equal(question.status,201,JSON.stringify(question.body));
 const invoked=await api("/api/rooms/"+rid+"/owner-agent/invoke","POST",visitor,{
  trigger_message_id:question.body.id,
 });
 assert.equal(invoked.status,200,JSON.stringify(invoked.body));
 assert.equal(invoked.body.outcome,"replied");
 const props=await api("/api/rooms/"+rid+"/proposals");
 assert.equal(props.status,200);
 const opt=props.body.proposals.find(x=>x.name==="옵션");
 assert.ok(opt,JSON.stringify(props.body));
 assert.equal(opt.status,"proposed");
 assert.equal(opt.created_by,"owner_agent");
 assert.match(opt.value,/고양이.*두 마리/);
 assert.deepEqual(opt.source_msg_ids,[invoked.body.messageId]);
 assert.ok(opt.card_msg_id);
 const messages=(await api("/api/rooms/"+rid+"/messages")).body;
 assert.ok(messages.some(m=>m.id===opt.card_msg_id&&m.author_type==="assistant"));
 const state=(await api("/api/rooms/"+rid+"/transaction-state")).body;
 assert.equal(state.stages.find(s=>s.key==="living").confirmedValue,null);
 const reInvoked=await api("/api/rooms/"+rid+"/owner-agent/invoke","POST",visitor,{trigger_message_id:question.body.id});
 assert.equal(reInvoked.status,200);
 assert.equal(reInvoked.body.messageId,invoked.body.messageId);
 const messages2=(await api("/api/rooms/"+rid+"/messages")).body;
 assert.equal(messages2.filter(m=>m.author_type==="assistant"&&/AI 대리인이 전했어요/.test(m.text)).length,1);
});

test("동시 중복 가격 제안은 카드 한 개, 동시 양측 동의는 반드시 agreed",async()=>{
 const listing=await api("/api/listings","POST",owner,{
  title:"가격 동시성 검증 매물",address:"검증 합성 주소",tradeType:"월세",
  deposit:2100,rent:75,salePrice:0,fee:0,area:37,moveIn:"2026-12-01",
  options:[],publisher:"집주인",description:"경합 검증",
 });
 assert.equal(listing.status,201,JSON.stringify(listing.body));
 const lid=listing.body.id;
 const room=await api("/api/deals/"+lid+"/rooms","POST",visitor,{});
 assert.equal(room.status,201);
 const rid=room.body.id,path="/api/rooms/"+rid+"/messages";
 const content="보증금 2,500만원 / 월세 70만원이면 괜찮습니다.";
 const sent=await Promise.all([
  api(path,"POST",owner,{text:content}),
  api(path,"POST",visitor,{text:content}),
 ]);
 assert.deepEqual(sent.map(r=>r.status),[201,201],JSON.stringify(sent));
 const props=(await api("/api/rooms/"+rid+"/proposals")).body.proposals.filter(p=>p.name==="월세 조건");
 assert.equal(props.length,1,JSON.stringify(props));
 assert.equal(props[0].status,"proposed");
 const cardMsgId=props[0].card_msg_id;
 assert.ok(cardMsgId);
 const responsePath="/api/rooms/"+rid+"/proposals/"+props[0].id+"/decide";
 const approved=await Promise.all([
  api(responsePath,"POST",owner,{decision:"agree",version:props[0].version}),
  api(responsePath,"POST",visitor,{decision:"agree",version:props[0].version}),
 ]);
 assert.deepEqual(approved.map(x=>x.status),[200,200],JSON.stringify(approved));
 const final=(await api("/api/rooms/"+rid+"/proposals")).body.proposals.find(x=>x.id===props[0].id);
 assert.equal(final.status,"agreed","simultaneous approvals must not lose agreement");
 const guide=(await api(path)).body.filter(m=>m.author_type==="assistant");
 assert.equal(guide.filter(m=>m.id===cardMsgId).length,1);
 assert.equal(guide.filter(m=>/월세 조건.*두 분 모두 동의/.test(m.text)).length,1);
});
