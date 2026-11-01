import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";
import {makeSampleRegistryPdf,syntheticRegistryDemoHashes} from "../lib/registry-draft.ts";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const PORT=3197,BASE=`http://127.0.0.1:${PORT}`;
const DB=join(ROOT,"data",`registry-privacy-${process.pid}.db`);
const JWT_SECRET="registry-privacy-isolated-secret";
const WRITE="registry-privacy-write-test";
const token=mintTestToken("privacy-tester","테스터","landlord",JWT_SECRET,Math.floor(Date.now()/1000)+3600);
let server;

before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(PORT)],{
  cwd:ROOT,
  env:{...process.env,DB_PATH:DB,SUPABASE_JWT_SECRET:JWT_SECRET,
   AGENT_PROVIDER:"meta",REGISTRY_AI_ENABLED:"true",MODEL_API_KEY:"TEST_KEY_NOT_FOR_REAL_CALLS",
   WRITE_TOKEN:WRITE,RATE_LIMIT_PER_MIN:"999"},
  stdio:"ignore",
 });
 let started=false;
 for(let i=0;i<70;i++){
  try{if((await fetch(BASE+"/api/health")).ok){started=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,450));
 }
 assert.equal(started,true,"isolated Next server started");
});
after(()=>{
 if(server)server.kill();
 for(const suffix of ["","-wal","-shm"]){try{rmSync(DB+suffix,{force:true});}catch{}}
});

test("Meta 업로드 capability는 합성 예시만 허용하며 공개 fingerprint가 서버 값과 같다",async()=>{
 const r=await fetch(BASE+"/api/listings/import-registry");
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.provider,"meta");
 assert.equal(body.sampleOnly,true);
 assert.equal(body.enabled,true);
 assert.deepEqual(body.acceptedHashes,syntheticRegistryDemoHashes());
});

test("실문서와 구분되지 않는 미등록 PDF는 Meta API 호출 전에 422 거부",async()=>{
 const unknown=Buffer.from(makeSampleRegistryPdf());
 unknown[105]^=1; // Still a structurally plausible synthetic PDF but not in allowlist.
 const r=await fetch(BASE+"/api/listings/import-registry",{
  method:"POST",
  headers:{"Content-Type":"application/json","x-write-token":WRITE,
   Authorization:"Bearer "+token},
  body:JSON.stringify({filename:"unknown-registry.pdf",
   pdf_base64:unknown.toString("base64"),consent:true}),
 });
 const body=await r.json();
 assert.equal(r.status,422,"unknown document must never reach external model");
 assert.match(body.error,/가상 PDF|전송을 차단/);
});
