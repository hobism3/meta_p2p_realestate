import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {rmSync} from "node:fs";
import {mintTestToken} from "../lib/auth.ts";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const port=3292,base="http://127.0.0.1:"+port;
const db=join(root,"data","p13-gallery-"+process.pid+".db");
const secret="gallery-p13-auth-secret";
const owner=mintTestToken("gallery-owner","집주인","landlord",secret,Math.floor(Date.now()/1000)+3600);
const stranger=mintTestToken("gallery-other","타인","landlord",secret,Math.floor(Date.now()/1000)+3600);
const writeToken="gallery-test-write-token";
const headers=(token=owner)=>({"content-type":"application/json","x-write-token":writeToken,
 ...(token?{authorization:"Bearer "+token}:{})});
function demoJpeg(exif=false){
 const start=Buffer.from([0xff,0xd8,0xff,exif?0xe1:0xe0,0,6,0x4a,0x46,0x49,0x46]);
 const frame=Buffer.from([0xff,0xc0,0,17,8,0,128,0,128,3,1,0x11,0,2,0x11,0,3,0x11,0]);
 const scan=Buffer.from([0xff,0xda,0,8,1,1,0,0,0x3f,0]);
 return Buffer.concat([start,frame,scan,Buffer.alloc(600,42),Buffer.from([0xff,0xd9])]);
}
const jpeg=()=> "data:image/jpeg;base64,"+demoJpeg().toString("base64");
let server,listingId,photoId;
before(async()=>{
 server=spawn("node",["node_modules/next/dist/bin/next","start","-p",String(port)],{
  cwd:root,env:{...process.env,DB_PATH:db,SUPABASE_JWT_SECRET:secret,
   SUPABASE_URL:"",DATABASE_URL:"",WRITE_TOKEN:writeToken,RATE_LIMIT_PER_MIN:"999"},stdio:"ignore"});
 let ready=false;
 for(let i=0;i<70;i++){try{if((await fetch(base+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,400));}
 assert.equal(ready,true,"isolated Next server started");
 const create=await fetch(base+"/api/listings",{method:"POST",headers:headers(),
  body:JSON.stringify({title:"가상 테스트 등록",address:"테스트 주소",moveIn:"2027-01-01",
   publisher:"테스트",tradeType:"월세",deposit:500,rent:60,area:32,fee:5})});
 assert.equal(create.status,201,"created owner-bound custom listing");
 listingId=(await create.json()).id;
});
after(()=>{server?.kill();for(const suffix of ["","-wal","-shm"])try{rmSync(db+suffix,{force:true});}catch{}});
const gallery=()=>base+"/api/listings/"+listingId+"/gallery";
const publish=(token=owner,data={})=>fetch(gallery(),{method:"POST",headers:headers(token),body:JSON.stringify({
  image:jpeg(),room:"kitchen",consentToPublish:true,checkedPersonalInfo:true,
  clientReencoded:true,masked:true,aiGenerated:false,...data})});
test("public listing and gallery show no source owner_id or base64",async()=>{
 const r=await fetch(gallery());assert.equal(r.status,200);
 const body=await r.json();assert.deepEqual(body.photos,[]);
 assert.ok(!JSON.stringify(body).includes("image_base64"));
});
test("unauthorized publisher and missing consent rejected; no write",async()=>{
 assert.equal((await publish(null)).status,401);
 assert.equal((await publish(stranger)).status,403);
 assert.equal((await publish(owner,{consentToPublish:false})).status,400);
 assert.equal((await publish(owner,{aiGenerated:true})).status,400);
 assert.equal((await publish(owner,{clientReencoded:false})).status,400);
 assert.equal((await publish(owner,{image:"data:image/jpeg;base64,"+demoJpeg(true).toString("base64")})).status,422);
 assert.equal((await (await fetch(gallery())).json()).photos.length,0);
});
test("owner publishes, public sees only JPEG, duplicate and unauthorized delete blocked",async()=>{
 const add=await publish();assert.equal(add.status,201);
 photoId=(await add.json()).id;assert.ok(photoId);
 const list=await fetch(gallery());const out=await list.json();
 assert.equal(out.photos.length,1);
 assert.equal(out.photos[0].masked,true);
 assert.equal(out.photos[0].room,"kitchen");
 assert.equal(JSON.stringify(out).includes("image_base64"),false);
 const image=await fetch(gallery()+"/"+photoId);
 assert.equal(image.status,200);assert.equal(image.headers.get("content-type"),"image/jpeg");
 assert.equal(image.headers.get("x-content-type-options"),"nosniff");
 assert.equal(image.headers.get("cache-control").includes("no-store"),true);
 assert.equal((await image.arrayBuffer()).byteLength,demoJpeg().length);
 assert.equal((await publish()).status,409,"deduplicated");
 assert.equal((await fetch(gallery()+"/"+photoId,{method:"DELETE",headers:headers(stranger)})).status,403);
 const detail=await (await fetch(base+"/api/listings/"+listingId)).json();
 assert.ok(detail.coverPhotoUrl.endsWith(photoId));
 assert.equal(detail.photoCount,1);
});
test("published derivatives are deleted by owner and no longer retrievable",async()=>{
 const gone=await fetch(gallery()+"/"+photoId,{method:"DELETE",headers:headers()});
 assert.equal(gone.status,200);
 assert.equal((await fetch(gallery()+"/"+photoId)).status,404);
 assert.equal((await (await fetch(gallery())).json()).photos.length,0);
});
