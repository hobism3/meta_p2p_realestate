import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { mintTestToken } from "../lib/auth.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3213;
const base = "http://127.0.0.1:" + port;
const db = join(root, "data", "photo-empty-view-" + process.pid + ".db");
const jwt = "photo-empty-view-isolated-secret";
const token = mintTestToken("visual-owner","사진 테스트","landlord",jwt,Math.floor(Date.now()/1000)+3600);
const jpeg = Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(180,18),Buffer.from([0xff,0xd9])]);
const image = "data:image/jpeg;base64," + jpeg.toString("base64");
const webp = Buffer.concat([Buffer.from("RIFF"),Buffer.from([12,0,0,0]),Buffer.from("WEBPVP8 ")]);
let server, upstream, upstreamPort;
let calls = 0, lastRequest = null, broken = false;
before(async () => {
  upstream = createServer(async (req,res) => {
    calls++;
    const chunks=[];
    for await (const part of req) chunks.push(part);
    lastRequest = {path:req.url,body:JSON.parse(Buffer.concat(chunks).toString("utf8")),
      authenticated:req.headers.authorization === "Bearer TEST_PHOTO_KEY"};
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify(broken ? {data:[{url:"https://bad.example/image.svg"}]} :
      {output_format:"webp",data:[{b64_json:webp.toString("base64")}]}));
  });
  await new Promise((resolve) => upstream.listen(0,"127.0.0.1",resolve));
  upstreamPort = upstream.address().port;
  server = spawn("node",["node_modules/next/dist/bin/next","start","-p",String(port)],{
    cwd:root,
    env:{...process.env,DB_PATH:db,SUPABASE_JWT_SECRET:jwt,PHOTO_EMPTY_VIEW_ENABLED:"true",
      MODEL_API_KEY:"TEST_PHOTO_KEY",MODEL_API_BASE:"http://127.0.0.1:"+upstreamPort,
      WRITE_TOKEN:"visual-test-write",RATE_LIMIT_PER_MIN:"999"},
    stdio:"ignore",
  });
  let healthy=false;
  for(let i=0;i<70;i++){
    try{if((await fetch(base+"/api/health")).ok){healthy=true;break;}}catch{}
    await new Promise((r)=>setTimeout(r,450));
  }
  assert.equal(healthy,true,"isolated Next server started");
});
after(async () => {
  server?.kill();
  await new Promise((resolve) => upstream?.close(resolve));
  for(const end of ["","-wal","-shm"])try{rmSync(db+end,{force:true});}catch{}
});
function post(body, {authenticated=true}={}) {
  return fetch(base+"/api/listings/photo-empty-view",{
    method:"POST",headers:{"Content-Type":"application/json","x-write-token":"visual-test-write",
      ...(authenticated?{Authorization:"Bearer "+token}:{})},
    body:JSON.stringify(body),
  });
}
test("capability GET is explicit and does not expose API key",async()=>{
  const response=await fetch(base+"/api/listings/photo-empty-view");
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.enabled,true);
  assert.equal(body.maximumEditsPerHour,2);
  assert.equal(JSON.stringify(body).includes("TEST_PHOTO_KEY"),false);
});
test("no auth / no separate edit consent / remote URL are blocked without model call",async()=>{
  const start=calls;
  assert.equal((await post({consent:true,purpose:"empty-room-preview",image},{authenticated:false})).status,401);
  assert.equal((await post({consent:false,purpose:"empty-room-preview",image})).status,400);
  assert.equal((await post({consent:true,purpose:"empty-room-preview",image:"https://example.com/house.jpg"})).status,422);
  assert.equal(calls,start);
});
test("valid synthetic JPEG is edited via Meta-shaped upstream and returned as local-only preview",async()=>{
  const response=await post({consent:true,purpose:"empty-room-preview",image});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.kind,"ai_simulation");
  assert.equal(body.provider,"meta");
  assert.equal(body.image,"data:image/webp;base64,"+webp.toString("base64"));
  assert.equal(lastRequest.path,"/images/edits");
  assert.equal(lastRequest.authenticated,true);
  assert.equal(lastRequest.body.model,"muse-image-1.0");
  assert.equal(lastRequest.body.images[0].image_url,image);
  assert.equal(lastRequest.body.n,1);
  assert.match(lastRequest.body.prompt,/camera angle/);
});
test("unsafe upstream URL output rejected; quota is not bypassed by retries",async()=>{
  broken=true;
  assert.equal((await post({consent:true,purpose:"empty-room-preview",image})).status,502);
  const before=calls;
  assert.equal((await post({consent:true,purpose:"empty-room-preview",image})).status,429);
  assert.equal(calls,before);
});
