import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = join(ROOT, "data", `ziptok-repair-${process.pid}.db`);
const PORT = 3153;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "ziptok-repair-secret", WRITE = "repair-test-write";
const HUMAN = mintTestToken("repair-buyer", "임차인", "tenant", SECRET, Math.floor(Date.now()/1000)+3600);
let server, room, dal;
async function api(path, method = "GET", token = HUMAN, body = {}) {
  const res = await fetch(BASE + path, {method,headers: {
    "content-type":"application/json", "x-write-token":WRITE,
    ...(token ? {authorization:"Bearer "+token} : {}),
  },...(method !== "GET" ? {body:JSON.stringify(body)} : {})});
  return {status:res.status,body:await res.json().catch(()=>null)};
}
before(async () => {
  server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
    cwd:ROOT,env:{...process.env,DB_PATH:DB,WRITE_TOKEN:WRITE,
      SUPABASE_JWT_SECRET:SECRET,RATE_LIMIT_PER_MIN:"1000",MODEL_PROVIDER:"mock"},stdio:"ignore",
  });
  let up=false;
  for(let i=0;i<65;i++){
    try{const h=await fetch(BASE+"/api/health");if(h.ok){up=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.equal(up,true,"Next server should start");
  const created=await api("/api/deals/s02/rooms","POST");
  assert.equal(created.status,201);
  room=created.body.id;
  process.env.DB_PATH=DB;
  const module=await import("../lib/dal.ts");
  dal=module.getDal();
});
after(async()=>{
  if(server)server.kill();
  for(const s of ["","-wal","-shm"])try{rmSync(DB+s,{force:true});}catch{}
});
test("이전 방 재정리: 월세·반려묘·방문일을 근거/확인 카드로 복원, 무료·멱등",async()=>{
  const history=[
    ["human","보증금을 3천으로 올리고 월세 60되나요?"],
    ["demo_agent","테라스가 예쁜 집이라 월세 72 정도면 맞춰드릴게요"],
    ["human","내일 오후 2시에 방문하고 싶어요"],
    ["demo_agent","테라스 햇살 예쁜 내일 오후 두시에 편히 보러 오세요"],
    ["human","고양이 키워도 되나요?"],
    ["demo_agent","테라스 있는 집인데 고양이는 조용히 키우시면 괜찮아요"],
    ["human","여기 삼천에 월세 어디까지 된다고 하셨나요?"],
    ["demo_agent","테라스 곁들여 보증금 삼천에 월세 육십팔이면 좋겠어요"],
    ["human","전 좋아요"],
    ["demo_agent","테라스와 함께 삼천에 육십팔로 편히 진행해요"],
  ];
  for(let i=0;i<history.length;i++){
    const [kind,text]=history[i];
    const date=new Date(Date.parse("2026-10-30T06:00:00.000Z")+i*120000).toISOString();
    await dal.run(
      "INSERT INTO messages (id,listing_id,author,role,user_id,author_type,room_id,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [randomUUID(),"s02",kind==="human"?"임차인":"AI 임대인","",kind==="human"?"repair-buyer":`demo:${room}`,kind,room,text,date],
    );
  }
  const denied=await api(`/api/rooms/${room}/ziptalk/reconcile`,"POST",null);
  assert.ok([401,403].includes(denied.status));
  const first=await api(`/api/rooms/${room}/ziptalk/reconcile`,"POST");
  assert.ok([200,201].includes(first.status),JSON.stringify(first.body));
  assert.equal(first.body.provider,"mock");
  const snapshot=await api(`/api/rooms/${room}/conditions`);
  assert.equal(snapshot.status,200);
  const conditions=new Map(snapshot.body.conditions.map(c=>[c.name,c.value]));
  assert.equal(conditions.get("월세 조건"),"보증금 3,000만원/월세 68만원");
  assert.match(conditions.get("옵션")??"",/반려묘 허용/);
  assert.match(conditions.get("방문일")??"",/10월 31일.*2시/);
  const cards=await api(`/api/rooms/${room}/proposals`);
  assert.equal(cards.status,200);
  for(const name of ["월세 조건","옵션","방문일"]){
    assert.ok(cards.body.proposals.some(p=>p.name===name),`no ${name} card`);
  }
  const chat=await api(`/api/rooms/${room}/messages`);
  for(const p of cards.body.proposals){
    if(["월세 조건","옵션","방문일"].includes(p.name)){
      assert.ok(chat.body.some(m=>m.author_type==="assistant"&&m.id===p.card_msg_id));
    }
  }
  const beforeCount=cards.body.proposals.length;
  const again=await api(`/api/rooms/${room}/ziptalk/reconcile`,"POST");
  assert.equal(again.status,200);
  assert.equal(again.body.created,false);
  assert.equal((await api(`/api/rooms/${room}/proposals`)).body.proposals.length,beforeCount);
});
