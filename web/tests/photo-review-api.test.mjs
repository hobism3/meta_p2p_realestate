import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const port=3208,base="http://127.0.0.1:"+port;
const db=join(root,"data","photo-review-test-"+process.pid+".db");
const secret="photo-guide-unit-secret";
const token=mintTestToken("photo-user","사진테스터","landlord",secret,Math.floor(Date.now()/1000)+3600);
let server;
before(async()=>{
  server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(port)],{
    cwd:root,env:{...process.env,DB_PATH:db,SUPABASE_JWT_SECRET:secret,PHOTO_AI_ENABLED:"true",MODEL_API_KEY:"DO_NOT_CALL_REAL",WRITE_TOKEN:"photo-unit-write",RATE_LIMIT_PER_MIN:"999"},stdio:"ignore",
  });
  let ready=false;
  for(let i=0;i<70;i++){try{if((await fetch(base+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,450));}
  assert.equal(ready,true);
});
after(()=>{server?.kill(); for(const suffix of ["","-wal","-shm"])try{rmSync(db+suffix,{force:true});}catch{}});
const post=(data,auth=true)=>fetch(base+"/api/listings/photo-review",{method:"POST",headers:{"content-type":"application/json","x-write-token":"photo-unit-write",...(auth?{"Authorization":"Bearer "+token}:{})},body:JSON.stringify(data)});
test("unauthenticated photo review fails before external invocation",async()=>assert.equal((await post({consent:true,image:"fake"},false)).status,401));
test("photo review requires explicit consent",async()=>assert.equal((await post({image:"fake"})).status,400));
test("only strict jpeg data payload accepted; remote URL is blocked",async()=>{
  const res=await post({consent:true,image:"https://example.com/private.jpg"});
  assert.equal(res.status,422);
});
test("invalid or oversized image is blocked before the Meta request",async()=>{
  assert.equal((await post({consent:true,image:"data:image/jpeg;base64,"+"A".repeat(1600000)})).status,413);
});
