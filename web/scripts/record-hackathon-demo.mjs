/**
 * Repeatable 2:45–3:00 screen recording from the ACTUAL Next.js application.
 * No production credentials, no third-party API calls. Uses a local SQLite DB,
 * test-signed identities, synthetic photo, and deterministic mocked Meta endpoints.
 * The recording is a rehearsal asset, NOT a claim of live Meta inference.
 * Replace mocked AI segments with separately verified live footage before submission.
 */
import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const base="http://127.0.0.1:3130";
const output=join(process.cwd(),"demo-artifacts");
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const token=(sub)=> {
  const enc=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
  const header=enc({alg:"HS256",typ:"JWT"});
  const body=enc({sub,exp:Math.floor(Date.now()/1000)+3600,user_metadata:{name:sub}});
  const signature=createHmac("sha256",process.env.SUPABASE_JWT_SECRET||"test-e2e-secret")
    .update(header+"."+body).digest("base64url");
  return header+"."+body+"."+signature;
};
async function requireReady(){
  for(let i=0;i<90;i++){
    try{const res=await fetch(base+"/api/health");if(res.ok)return;}catch{}
    await sleep(1000);
  }
  throw Error("local server was not ready");
}
async function caption(page,title,subtitle,ms=5500){
  await page.evaluate(({title,subtitle})=>{
    document.querySelector("#video-demo-caption")?.remove();
    const el=document.createElement("div");
    el.id="video-demo-caption";
    Object.assign(el.style,{position:"fixed",zIndex:"2147483600",left:"50%",bottom:"20px",
      transform:"translateX(-50%)",width:"min(95%,1040px)",pointerEvents:"none",color:"#fff",
      borderRadius:"17px",padding:"18px 24px",background:"linear-gradient(110deg,rgba(10,35,54,.97),rgba(16,68,69,.96))",
      boxShadow:"0 12px 36px rgba(9,28,45,.3)",fontFamily:"system-ui,sans-serif"});
    const top=document.createElement("div");top.textContent=title;
    Object.assign(top.style,{fontSize:"23px",fontWeight:"850",lineHeight:"1.35"});
    const bottom=document.createElement("div");bottom.textContent=subtitle;
    Object.assign(bottom.style,{fontSize:"15px",lineHeight:"1.5",marginTop:"4px",color:"#c9e8e5"});
    el.append(top,bottom);document.body.append(el);
    if(!document.querySelector("#video-demo-watermark")){
      const badge=document.createElement("div");badge.id="video-demo-watermark";
      badge.textContent="SYNTHETIC DATA • MOCK AI REPLAY • NOT LIVE MODEL PROOF";
      Object.assign(badge.style,{position:"fixed",zIndex:"2147483601",top:"6px",left:"50%",transform:"translateX(-50%)",
        maxWidth:"99%",textAlign:"center",font:"bold 11px system-ui,sans-serif",letterSpacing:".08em",
        color:"#213b45",background:"#fff3d1",border:"1px solid #e5c47b",padding:"5px 12px",
        borderRadius:"999px",pointerEvents:"none"});
      document.body.append(badge);
    }
  },{title,subtitle});
  const first=Math.min(ms,2800);
  await page.waitForTimeout(first);
  await page.evaluate(() => document.querySelector("#video-demo-caption")?.remove());
  if(ms>first) await page.waitForTimeout(ms-first);
}
const type=async (locator,value)=>{await locator.fill(value);await sleep(280)};
const api=async (path,method,identity,data)=>{
 const res=await fetch(base+path,{method,headers:{Authorization:"Bearer "+identity,"Content-Type":"application/json"},body:JSON.stringify(data)});
 if(!res.ok)throw Error("demo API "+method+" "+path+" "+res.status+": "+(await res.text()).slice(0,200));
 return res.json();
};
await mkdir(output,{recursive:true});
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3130"],{
  cwd:process.cwd(),env:{...process.env,DB_PATH:"./data/hackathon-recording.db",
    SUPABASE_JWT_SECRET:"test-e2e-secret",AGENT_PROVIDER:"mock",RATE_LIMIT_PER_MIN:"1000"},
  stdio:["ignore","pipe","pipe"]
});
server.stdout.on("data",()=>{});server.stderr.on("data",()=>{});
let browser,context;
try{
 await requireReady();
 browser=await chromium.launch({headless:true});
 context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,
   recordVideo:{dir:output,size:{width:1280,height:720}}});
 const page=await context.newPage();
 page.setDefaultTimeout(12000);
 const owner=token("hackathon-owner-demo"),visitor=token("hackathon-visitor-demo");
 // All Meta endpoints are mocked. This prevents ANY billable request.
 await page.route("**/api/listings/photo-review",route=>{
   if(route.request().method()==="GET")return route.fulfill({json:{enabled:true,provider:"mock"}});
   return route.fulfill({json:{provider:"mock",review:{room:"living_room",
     features:["에어컨","냉장고"],privacyFlags:[]}}});
 });
 let emptyPreview="";
 await page.route("**/api/listings/photo-empty-view",route=>{
   if(route.request().method()==="GET")return route.fulfill({json:{enabled:true,model:"muse-image-1.0"}});
   return route.fulfill({json:{provider:"mock",kind:"ai_simulation",image:emptyPreview}});
 });
 await page.goto(base+"/showcase?lang=en");
 await caption(page,"One home. A clearer transaction.","DirectHome | Meta Global AI Developer Hackathon",10000);
 await caption(page,"From listing to verified human decisions","Owner tools, a neutral deal companion, and evidence-first registry guidance.",7600);
 await page.goto(base+"/");
 await page.evaluate(t=>localStorage.setItem("directhome.access_token",t),owner);
 await page.goto(base+"/register");
 await caption(page,"01  Create a listing","A five-step wizard reduces repetitive manual entry.",5200);
 await page.getByRole("button",{name:/직접 입력해서 시작|Start from scratch/}).click();
 await type(page.locator("#title"),"Demo home | bright two-room rental");
 await type(page.locator("#address"),"서울시 가상구 데모로 12 (합성)");
 await type(page.locator("#area"),"46");
 await caption(page,"Property facts stay editable","No photo or model output is published automatically.",5200);
 await page.getByRole("button",{name:/다음 단계|Continue/}).click();
 await type(page.locator("#deposit"),"2000");
 await type(page.locator("#rent"),"85");
 await page.getByRole("button",{name:/다음 단계|Continue/}).click();

 // Entirely synthetic room drawing, not an actual listing photo.
 const jpeg=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=960;c.height=640;
   const x=c.getContext("2d");if(!x)throw Error("no 2d canvas");
   x.fillStyle="#dcd4c9";x.fillRect(0,0,960,640);
   x.fillStyle="#c3b8a6";x.fillRect(0,420,960,220);
   x.fillStyle="#8ebad2";x.fillRect(575,50,250,270);
   x.fillStyle="#f4f6f2";x.fillRect(585,60,230,250);
   x.fillStyle="#9ecde3";x.fillRect(592,65,216,235);
   x.fillStyle="#655a54";x.fillRect(90,350,430,100);
   x.fillStyle="#a8886b";x.fillRect(75,420,470,95);
   x.fillStyle="#625651";x.fillRect(110,505,45,55);x.fillRect(460,505,45,55);
   x.fillStyle="#f3e8d7";x.fillRect(300,335,125,50);
   x.fillStyle="#434f57";x.fillRect(740,380,115,170);
   // Avoid the byte-identical synthetic fixture hash used by prior rehearsals.
   // A small canvas watermark makes this test file unique without personal data.
   x.fillStyle="#2b4050";x.font="bold 16px sans-serif";
   x.fillText("FICTIONAL DEMO IMAGE "+Date.now().toString(36),25,32);
   return c.toDataURL("image/jpeg",0.9).split(",")[1];
 });
 emptyPreview=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=960;c.height=640;
   const x=c.getContext("2d");if(!x)throw Error("no 2d canvas");
   x.fillStyle="#ded5ca";x.fillRect(0,0,960,640);
   x.fillStyle="#c3b9a8";x.fillRect(0,420,960,220);
   x.fillStyle="#9ecde3";x.fillRect(592,65,216,235);
   x.fillStyle="#f3efe8";x.fillRect(580,45,240,18);
   x.fillStyle="#f3efe8";x.fillRect(580,305,240,18);
   return c.toDataURL("image/webp",0.85);
 });
 await page.locator('.photo-guide input[type="file"]').setInputFiles({name:"synthetic-owner-room.jpg",
   mimeType:"image/jpeg",buffer:Buffer.from(jpeg,"base64")});
 await caption(page,"02  Review photos with AI","Explicit opt-in, per-photo analysis, and clear control over every result.",7800);
 await page.getByRole("checkbox",{name:/Meta Vision AI/}).check();
 await page.getByRole("button",{name:/이 사진 AI 분석|Analyze this photo/}).click();
 await page.getByRole("heading",{name:/AI가 사진 1장에서 찾아낸 내용|AI findings from 1 photo/}).waitFor();
 await caption(page,"Muse Spark Vision · feature flow (Mock replay)","Room label: living room. Candidate amenities: air conditioner and refrigerator.",8000);
 const chip=page.locator(".photo-guide-option-chips .feature-chip").filter({hasText:/에어컨|Air conditioner/});
 await chip.click();
 await page.getByRole("button",{name:/선택한 1개를 매물 옵션 입력란에 추가|선택한 1개를 실제 매물에 저장/}).click();
 await caption(page,"Humans confirm every candidate","AI suggestions never become binding listing facts on their own.",7000);
 await page.getByRole("checkbox",{name:/Meta Muse Image|AI 가상 이미지 생성을 위해/}).check();
 await page.getByRole("button",{name:/가구 없는 모습 미리보기|Preview empty room/}).click();
 await page.locator(".photo-guide-comparison img").first().waitFor();
 await caption(page,"Muse Image · virtual staging (Mock replay)","Furniture-free previews are labeled simulations, never evidence of real property condition.",8000);
 await type(page.locator("#moveIn"),"2026-12-01");
 await type(page.locator("#publisher"),"Demo owner");
 await page.getByRole("button",{name:/다음 단계|Continue/}).click();
 await caption(page,"Review before publication","Every field and selected option remains under the owner's control.",5500);
 await page.getByRole("button",{name:/매물 등록하기|Save listing/}).click();
 await page.getByRole("heading",{name:/매물 등록을 마쳤어요|Listing saved/}).waitFor();
 await caption(page,"03  Keep the same photos after saving","No second upload. Review, mask, and explicitly approve photo publication.",8000);
 await page.getByRole("checkbox",{name:/검토한 게시용 JPEG 사진 공개|approve the reviewed JPEG/}).check();
 const publicationResult=page.waitForResponse(r=>
   r.url().includes("/gallery")&&r.request().method()==="POST",{timeout:15000});
 await page.getByRole("button",{name:/검토한 사진 공개하기|Publish approved photo/}).click();
 const publication=await publicationResult;
 const publicationData=await publication.json().catch(()=>({}));
 const publicationError=typeof publicationData.error==="string"?
   publicationData.error.slice(0,160):"unknown";
 console.log("GALLERY_STATUS",publication.status(),publication.ok()?"OK":publicationError);
 if(!publication.ok()) {
   console.warn("Gallery publication not demonstrated; showing disclosure instead of claiming a successful post.");
   await caption(page,"Photo publishing needs a follow-up check",
     "The owner must approve each real photo. This rehearsal did not confirm gallery publication.",3500);
 } else {
   await page.getByRole("button",{name:/게시 완료|Published/}).waitFor();
 }
 await caption(page,publication.ok()?"Published with owner approval":"Photo publishing: verification required",
   publication.ok()?"Only a compressed real-photo JPEG is public; simulated edits stay private.":"This isolated rehearsal could not publish the synthetic test photo.",7300);
 const detail=page.getByRole("link",{name:/완성된 매물 보기|상세 보기|View listing/}).first();
 const href=await detail.getAttribute("href");
 if(!href)throw Error("missing generated listing link");
 const listingId=href.split("/").pop();
 await page.goto(base+href);
 await caption(page,"Visitors see clearly labeled property information","Photos, price, options, and ownership caveats remain distinct.",6500);

 await page.goto(base+"/registry/extract");
 await caption(page,"04  Registry evidence, not legal advice","Educational PDFs are parsed locally; uncertain rights remain unverified.",7500);
 // Actual local workflow: two test-signed actors, one listing, same proposal version.
 await api("/api/deals/"+listingId+"/rooms","POST",visitor,{})
   .then(async room=>{
     const rid=room.id;
     await api("/api/rooms/"+rid+"/messages","POST",owner,{text:"보증금 3,000만원 / 월세 68만원이면 괜찮습니다."});
     await page.evaluate(t=>localStorage.setItem("directhome.access_token",t),visitor);
     await page.goto(base+"/rooms/"+rid);
     await page.getByRole("log",{name:/거래 대화|Deal conversation/}).waitFor();
     await caption(page,"05  A neutral assistant tracks the deal","Jiptok surfaces proposed terms, sources, and unresolved next steps.",8200);
     const proposal=page.locator(".proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"}).first();
     await proposal.getByRole("button",{name:/동의하기|Agree/}).click();
     await caption(page,"One person's agreement is not enough","The same version must be acknowledged by both participants.",6500);
     await page.evaluate(t=>localStorage.setItem("directhome.access_token",t),owner);
     await page.reload();
     const ownerCard=page.locator(".proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"}).first();
     await ownerCard.getByRole("button",{name:/동의하기|Agree/}).click();
     await caption(page,"Both parties confirmed this version","No automated bargaining, signing, deposit payment, or legal guarantee.",7200);
   });
 await page.goto(base+"/showcase?lang=en");
 await caption(page,"Meta models + thoughtful safeguards","Evidence-linked summaries, scoped decisions, opt-in privacy, and reproducible tests.",7000);
 await caption(page,"DirectHome | Built during the 2026 Meta Hackathon","Public source, runnable product, and honest model-vs-Mock evidence.",6500);
 const source=await page.video()?.path();
 await context.close();context=null;
 if(!source)throw Error("Playwright did not record a video");
 await copyFile(source,join(output,"directhome-hackathon-mock-rehearsal.webm"));
 console.log("DEMO_RECORDING="+join(output,"directhome-hackathon-mock-rehearsal.webm"));
}finally{
 if(context)await context.close().catch(()=>{});
 if(browser)await browser.close().catch(()=>{});
 server.kill("SIGTERM");
}
