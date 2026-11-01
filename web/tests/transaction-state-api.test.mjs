import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),".."),PORT=3171;
const DB=join(ROOT,"data",`transaction-projection-${process.pid}.db`);
const BASE=`http://127.0.0.1:${PORT}`,SECRET="transaction-projection-test",WRITE="test-write";
const auth=id=>mintTestToken(id,"검증자","tenant",SECRET,Math.floor(Date.now()/1000)+3600);
const owner=auth("tx-owner"),tenant=auth("tx-tenant"),outsider=auth("tx-outsider");
let server,listingId,roomId;
async function api(path,method="GET",who=tenant,body){
 const r=await fetch(BASE+path,{method,headers:{"Content-Type":"application/json","x-write-token":WRITE,
  ...(who?{Authorization:"Bearer "+who}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
const stage=(payload,key)=>payload.stages.find(s=>s.key===key);
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:SECRET,WRITE_TOKEN:WRITE,RATE_LIMIT_PER_MIN:"999"},
  stdio:"ignore",
 });
 let started=false;
 for(let i=0;i<75;i++){try{if((await fetch(BASE+"/api/health")).ok){started=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,300));}
 assert.equal(started,true,"Next server started");
 const listing=await api("/api/listings","POST",owner,{
  title:"거래 진행 상태 검증",address:"서울 가상 주소",tradeType:"월세",deposit:1800,rent:78,
  salePrice:0,fee:0,area:42,moveIn:"2026-12-01",publisher:"집주인",description:"합성 검증",options:[],
 });
 assert.equal(listing.status,201,JSON.stringify(listing.body));listingId=listing.body.id;
 assert.equal((await api("/api/owner/listings/"+listingId+"/ai","PUT",owner,{
  aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
  answers:{pets:"고양이 가능",parking:"",notes:""},
 })).status,200);
 const room=await api("/api/deals/"+listingId+"/rooms","POST",tenant,{});
 assert.equal(room.status,201,JSON.stringify(room.body));roomId=room.body.id;
});
after(()=>{if(server)server.kill();for(const e of ["","-wal","-shm"])try{rmSync(DB+e,{force:true});}catch{}});
test("정형화된 상태 API는 방 멤버에게만, 처음엔 미확정",async()=>{
 const endpoint="/api/rooms/"+roomId+"/transaction-state";
 assert.equal((await api(endpoint,"GET",outsider)).status,403);
 assert.equal((await api(endpoint,"GET",null)).status,401);
 const initial=await api(endpoint);
 assert.equal(initial.status,200,JSON.stringify(initial.body));
 assert.equal(initial.body.demo,false);
 assert.equal(stage(initial.body,"price").status,"not-started");
 assert.equal(stage(initial.body,"visit").status,"not-started");
});
test("고양이 대화는 미확정, 옵션 카드 양쪽 동의 후에만 일부 합의",async()=>{
 const endpoint="/api/rooms/"+roomId+"/transaction-state";
 assert.equal((await api("/api/rooms/"+roomId+"/messages","POST",owner,{text:"고양이 한 마리는 괜찮습니다."})).status,201);
 const before=await api(endpoint);
 assert.equal(stage(before.body,"living").status,"discussing");
 assert.equal(stage(before.body,"living").confirmedValue,null);
 const proposed=await api("/api/rooms/"+roomId+"/proposals/create","POST",tenant,{
  name:"옵션",value:"고양이 한 마리 허용",
 });
 assert.equal(proposed.status,201,JSON.stringify(proposed.body));
 const p=proposed.body;
 const pending=await api(endpoint);
 assert.equal(stage(pending.body,"living").status,"pending");
 assert.equal(stage(pending.body,"living").confirmedValue,null);
 const visitorDecision=await api("/api/rooms/"+roomId+"/proposals/"+p.id+"/decide","POST",tenant,
  {decision:"agree",version:p.version});
 assert.equal(visitorDecision.status,200);
 const one=await api(endpoint);
 assert.equal(stage(one.body,"living").status,"pending");
 const ownerDecision=await api("/api/rooms/"+roomId+"/proposals/"+p.id+"/decide","POST",owner,
  {decision:"agree",version:p.version});
 assert.equal(ownerDecision.status,200,JSON.stringify(ownerDecision.body));
 assert.equal(ownerDecision.body.status,"agreed");
 const afterAgreed=await api(endpoint);
 assert.equal(stage(afterAgreed.body,"living").status,"partial");
 assert.match(stage(afterAgreed.body,"living").confirmedValue,/고양이/);
});
test("월세 조건: 한 사람 동의는 미확정, 두 사람 동의 후 확정",async()=>{
 const uri="/api/rooms/"+roomId+"/proposals/create";
 const p=await api(uri,"POST",tenant,{name:"월세 조건",value:"보증금 3,000만원 / 월세 68만원"});
 assert.equal(p.status,201,JSON.stringify(p.body));
 const dec="/api/rooms/"+roomId+"/proposals/"+p.body.id+"/decide";
 assert.equal((await api(dec,"POST",tenant,{decision:"agree",version:p.body.version})).status,200);
 const one=await api("/api/rooms/"+roomId+"/transaction-state");
 assert.equal(stage(one.body,"price").status,"pending");
 assert.equal(stage(one.body,"price").confirmedValue,null);
 const yes=await api(dec,"POST",owner,{decision:"agree",version:p.body.version});
 assert.equal(yes.status,200,JSON.stringify(yes.body));
 assert.equal(yes.body.status,"agreed");
 const complete=await api("/api/rooms/"+roomId+"/transaction-state");
 assert.equal(stage(complete.body,"price").status,"confirmed");
 assert.equal(stage(complete.body,"price").confirmedValue,"보증금 3,000만원/월세 68만원");
});
test("실제 방문은 별도 bookings 예약 승인 후 확정",async()=>{
 let date="";
 for(let i=1;i<=8;i++){
  const value=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"})
    .format(new Date(Date.now()+i*86400000));
  if(new Date(value+"T00:00:00Z").getUTCDay()===6){date=value;break;}
 }
 assert.ok(date);
 const booking=await api("/api/rooms/"+roomId+"/bookings","POST",tenant,{date,time:"13:00"});
 assert.equal(booking.status,201,JSON.stringify(booking.body));
 const before=await api("/api/rooms/"+roomId+"/transaction-state");
 assert.equal(stage(before.body,"visit").status,"pending");
 assert.equal(stage(before.body,"visit").confirmedValue,null);
 assert.equal((await api("/api/rooms/"+roomId+"/bookings/"+booking.body.id,"PATCH",tenant,{action:"confirm"})).status,409);
 const ownerApproval=await api("/api/rooms/"+roomId+"/bookings/"+booking.body.id,"PATCH",owner,{action:"confirm"});
 assert.equal(ownerApproval.status,200);
 const afterApproved=await api("/api/rooms/"+roomId+"/transaction-state");
 assert.equal(stage(afterApproved.body,"visit").status,"confirmed");
 assert.match(stage(afterApproved.body,"visit").confirmedValue,/13:00/);
});
