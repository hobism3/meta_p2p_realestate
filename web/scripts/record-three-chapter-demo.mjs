/**
 * Three-chapter DirectHome browser documentary.
 *
 * Chapter A: real app registry import Mock + real, previously captured Meta
 *            Vision / Image outputs REPLAYED in actual photo editor UI.
 * Chapter B: real app Jiptok bilateral consent with fictional actors.
 * Chapter C: real browser-local educational PDF rights extraction and review.
 *
 * The small on-screen "Recorded Meta response" provenance is intentional:
 * these are genuine model outputs but NOT new live API calls. No secrets,
 * external API/model calls, real identities, or unverified source documents.
 */
import {chromium} from "@playwright/test";
import {createHmac} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile,copyFile,mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";

const root=process.cwd(),output=join(root,"demo-artifacts/three-chapter");
const base="http://127.0.0.1:3130";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const token=sub=>{
 const pack=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
 const h=pack({alg:"HS256",typ:"JWT"});
 const p=pack({sub,exp:Math.floor(Date.now()/1000)+3600,user_metadata:{name:sub}});
 const s=createHmac("sha256",process.env.SUPABASE_JWT_SECRET||"test-e2e-secret").update(h+"."+p).digest("base64url");
 return h+"."+p+"."+s;
};
async function ready(){
 for(let i=0;i<75;i++){try{if((await fetch(base+"/api/health")).ok)return;}catch{}
  await sleep(1000);}throw Error("App not ready");
}
async function api(path,method,bearer,payload){
 const response=await fetch(base+path,{method,headers:{Authorization:"Bearer "+bearer,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!response.ok)throw Error("API "+path+" "+response.status+" "+(await response.text()).slice(0,160));
 return response.json();
}
const events=[];
let started=Date.now();
function mark(name){const at=(Date.now()-started)/1000;events.push({name,at:+at.toFixed(2)});console.log("DEMO_MARK",name,at.toFixed(2));}
async function sleepScene(ms=2300){await sleep(ms);}
async function showBadge(page,section,note,kind="demo"){
 await page.evaluate(({section,note,kind})=>{
  document.querySelector("#demo-film-caption")?.remove();
  const box=document.createElement("aside");box.id="demo-film-caption";
  Object.assign(box.style,{position:"fixed",zIndex:"2147483200",left:"22px",bottom:"15px",
   color:"#f8fffa",background:"rgba(12,37,53,.93)",border:"1px solid rgba(130,208,192,.42)",
   borderRadius:"13px",padding:"10px 16px",font:"600 16px/1.5 system-ui,sans-serif",
   boxShadow:"0 6px 18px rgba(1,13,25,.16)",pointerEvents:"none",
   maxWidth:"min(750px,86vw)"});
  const title=document.createElement("strong");title.textContent=section;
  const detail=document.createElement("div");detail.textContent=note;
  Object.assign(detail.style,{fontSize:"12px",fontWeight:"400",color:"#c8dfdf",marginTop:"2px"});
  box.append(title,detail);document.body.append(box);
  document.querySelector("#film-source-badge")?.remove();
  if(kind!=="demo"){
   const source=document.createElement("span");source.id="film-source-badge";
   source.textContent=kind==="meta"?"Recorded Meta model output · one genuine captured call":"Educational synthetic data · Mock AI";
   Object.assign(source.style,{position:"fixed",zIndex:"2147483201",right:"12px",top:"65px",
    color:"#245a52",background:"rgba(236,254,247,.95)",font:"700 11px system-ui,sans-serif",
    borderRadius:"999px",padding:"6px 12px",pointerEvents:"none",border:"1px solid #b1e8d3"});
   document.body.append(source);
  }
 },{section,note,kind});
}
async function setCaption(page,t,n,ms=2500,kind="demo"){await showBadge(page,t,n,kind);await sleepScene(ms);}
async function focus(page,locator,ms=2100){
 await locator.scrollIntoViewIfNeeded();await sleepScene(ms);
}
async function fill(page,selector,value){await page.locator(selector).fill(value);await sleep(270);}
await mkdir(output,{recursive:true});
const source=join(root,"demo-evidence/captured/source_meta_generated.jpg");
const edited=join(root,"demo-evidence/captured/empty_view_actual.webp");
const visionPath=join(root,"demo-evidence/captured/vision_actual.json");
const educational=join(root,"demo-evidence/rights-study-synthetic.pdf");
const realVision=JSON.parse(await readFile(visionPath,"utf8"));
const sourceBytes=await readFile(source),editBytes=await readFile(edited);
if(realVision.provider!=="meta"||realVision.review?.room!=="living_room"||
 !realVision.review?.features?.includes("에어컨"))throw Error("Actual recorded Vision evidence unavailable");
const editUrl="data:image/webp;base64,"+editBytes.toString("base64");
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3130"],{
 cwd:root,env:{...process.env,DB_PATH:"./data/three-chapter-film.db",SUPABASE_JWT_SECRET:"test-e2e-secret",
 AGENT_PROVIDER:"mock",RATE_LIMIT_PER_MIN:"1000"},stdio:["ignore","pipe","pipe"]});
let browser,context;
try {
 await ready();
 browser=await chromium.launch({headless:true});
 context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,
  recordVideo:{dir:output,size:{width:1280,height:720}}});
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const owner=token("film-owner-synthetic"),visitor=token("film-visitor-synthetic");
 // These responses are authentic pre-recorded Meta outputs, not newly generated responses.
 await page.route("**/api/listings/photo-review",route=>{
  if(route.request().method()==="GET")return route.fulfill({json:{enabled:true,provider:"meta",model:"muse-spark-1.3"}});
  return route.fulfill({json:{provider:"meta",model:"muse-spark-1.3",review:realVision.review}});
 });
 await page.route("**/api/listings/photo-empty-view",route=>{
  if(route.request().method()==="GET")return route.fulfill({json:{enabled:true,model:"muse-image-1.0"}});
  return route.fulfill({json:{provider:"meta",kind:"ai_simulation",model:"muse-image-1.0",image:editUrl}});
 });
 await page.goto(base+"/showcase?lang=en");
 started=Date.now();mark("opening");
 await setCaption(page,"DirectHome","From listing to a clear next step.",2600);
 await page.evaluate(t=>localStorage.setItem("directhome.access_token",t),owner);
 await page.goto(base+"/register");
 mark("listing_pdf");
 await setCaption(page,"01 / 03   Create a listing","Start from an educational registry PDF.",2500,"mock");
 // Use EXACTLY the same byte-identical synthetic Korean PDF for registration
 // AND the later rights-analysis chapter. This is a whitelisted educational Mock.
 const sampleBytes=await readFile(educational);
 await page.locator("#registry-pdf").setInputFiles({name:"fictional-korean-registry.pdf",mimeType:"application/pdf",buffer:sampleBytes});
 await page.locator(".registry-consent input").check();
 await page.getByRole("button",{name:"AI로 매물 정보 추출하기"}).click();
 const extract=page.getByRole("heading",{name:"추출 결과 미리보기"});
 await extract.waitFor({state:"visible",timeout:20000});
 await focus(page,extract,2300);
 await setCaption(page,"Review extracted draft","Address and floor area are suggestions, never automatic publication.",2200,"mock");
 await page.getByRole("button",{name:"비어 있는 등록 항목에 반영하기"}).click();
 await page.locator("#address").waitFor();
 if(!(await page.locator("#address").inputValue()).trim()||
    !(await page.locator("#area").inputValue()).trim())throw Error("Registry draft did NOT prefill address and area");
 mark("prefilled");
 await setCaption(page,"Auto-filled property details","The owner can review and edit every field.",2100,"mock");
 await page.getByRole("button",{name:/다음 단계|Continue/}).click();
 await fill(page,"#deposit","2000");
 await fill(page,"#rent","85");
 await page.getByRole("button",{name:/다음 단계|Continue/}).click();
 await page.locator('.photo-guide input[type="file"]').setInputFiles({
  name:"meta-generated-apartment-living-room.jpg",mimeType:"image/jpeg",buffer:sourceBytes});
 mark("photo");
 await setCaption(page,"Photo-based listing assistance","One image, two useful tools in the actual product interface.",2200,"meta");
 await page.getByRole("checkbox",{name:/Meta Vision AI/}).check();
 await page.getByRole("button",{name:/이 사진 AI 분석|Analyze this photo/}).click();
 const finding=page.getByRole("heading",{name:/AI가 사진 1장에서 찾아낸 내용|AI findings from 1 photo/});
 await finding.waitFor();
 await focus(page,finding,1600);
 mark("vision");
 await setCaption(page,"What is visible?","Living room  ·  Air conditioner, identified by Meta Muse Spark.",3000,"meta");
 const feature=page.locator(".photo-guide-option-chips .feature-chip").filter({hasText:/에어컨|Air conditioner/}).first();
 await feature.click();
 await page.getByRole("button",{name:/선택한 1개를 매물 옵션 입력란에 추가|선택한 1개를 실제 매물에 저장|Add selected/}).click();
 await sleepScene(1300);
 await page.getByRole("checkbox",{name:/Meta Muse Image|AI 가상 이미지 생성을 위해/}).check();
 await page.getByRole("button",{name:/가구 없는 모습 미리보기|Preview empty room/}).click();
 const comparison=page.locator(".photo-guide-comparison");
 await comparison.waitFor();
 await focus(page,comparison,2400);
 mark("edit");
 await setCaption(page,"See the same room without furniture","Real Muse Image edit replayed inside DirectHome. A virtual preview only.",4500,"meta");
 await fill(page,"#moveIn","2026-12-01");
 await fill(page,"#publisher","Synthetic Demo Owner");
 await page.getByRole("button",{name:/다음 단계|Continue/}).click();
 await setCaption(page,"Check before saving","Only the owner can confirm the listing details.",1700,"mock");
 await page.getByRole("button",{name:/매물 등록하기|Save listing/}).click();
 const success=page.getByRole("heading",{name:/매물 등록을 마쳤어요|Listing saved/});
 await success.waitFor();
 await focus(page,success,1400);
 const detail=page.getByRole("link",{name:/완성된 매물 보기|상세 보기|View listing/}).first();
 const href=await detail.getAttribute("href");
 if(!href)throw Error("No resulting listing");
 const listingId=href.split("/").pop();
 mark("listing_saved");
 // Both synthetic participants use regular product endpoints, never privileged shortcuts.
 const room=await api("/api/deals/"+listingId+"/rooms","POST",visitor,{});
 const rid=room.id;
 await api("/api/rooms/"+rid+"/messages","POST",owner,{
  text:"보증금 3,000만원 / 월세 68만원이면 괜찮습니다."});
 await page.evaluate(t=>localStorage.setItem("directhome.access_token",t),visitor);
 await page.goto(base+"/rooms/"+rid);
 await page.getByRole("log",{name:/거래 대화|Deal conversation/}).waitFor();
 mark("jiptok");
 await setCaption(page,"02 / 03   Jiptok, the deal companion","It tracks what's proposed, confirmed, and still missing.",3300,"mock");
 const digest=page.locator("#jiptok-digest");
 if(await digest.count())await focus(page,digest,2000);
 const proposal=page.locator(".proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"}).first();
 await focus(page,proposal,1700);
 mark("pending");
 await setCaption(page,"Proposed does not mean agreed","The same terms must be approved by both parties.",2000,"mock");
 await proposal.getByRole("button",{name:/동의하기|Agree/}).click();
 await sleepScene(1400);
 mark("one_approval");
 await setCaption(page,"One party confirmed","Jiptok still shows a pending approval.",2100,"mock");
 await page.evaluate(t=>localStorage.setItem("directhome.access_token",t),owner);
 await page.reload();
 await page.getByRole("log",{name:/거래 대화|Deal conversation/}).waitFor();
 const ownerCard=page.locator(".proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"}).first();
 await focus(page,ownerCard,1200);
 await ownerCard.getByRole("button",{name:/동의하기|Agree/}).click();
 mark("bilateral");
 await setCaption(page,"Both participants confirmed the same proposal","Jiptok organizes the next verification steps. It does not sign contracts.",2800,"mock");
 if(await page.locator("#jiptok-digest").count())await focus(page,page.locator("#jiptok-digest"),1800);
 // The PDF rights check is a separate local evidence workflow, not a model risk certification.
 await page.goto(base+"/registry/extract");
 mark("rights_pdf");
 await setCaption(page,"03 / 03   Review registry rights","Import a fictional educational Korean title-record PDF, locally.",2600,"mock");
 const rightsBytes=await readFile(educational);
 await page.getByRole("textbox",{name:/PDF/}).count().catch(()=>0);
 await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({
  name:"fictional-korean-registry.pdf",mimeType:"application/pdf",buffer:rightsBytes});
 const parsed=page.getByRole("heading",{name:/3\. 후보 \d+건 검토/});
 await parsed.waitFor({state:"visible",timeout:25000});
 await focus(page,parsed,1500);
 const rows=page.locator("section[aria-live=polite] article.card");
 const count=await rows.count();console.log("RIGHT_CANDIDATES",count);
 if(count<2)throw Error("Expected >=2 PDF-extracted rights candidates; got "+count);
 mark("rights_candidates");
 await setCaption(page,"Rights extracted from the PDF text layer","Mortgage and provisional-seizure candidates need source review.",2600,"mock");
 for(let i=0;i<Math.min(3,count);i++){
  const item=rows.nth(i);
  await item.locator('select').selectOption("active");
  await item.locator('input[type=checkbox]').check();
 }
 const transfer=page.getByRole("button",{name:/선택한 정형 값만 권리관계 점검으로 가져오기|Send reviewed facts/});
 await transfer.scrollIntoViewIfNeeded();
 if(await transfer.isDisabled())throw Error("Evidence guard blocked rights transfer");
 await transfer.click();
 const summary=page.getByRole("heading",{name:/5\. 확인사항 결과|5\. Review findings/});
 await summary.waitFor();
 await focus(page,summary,1900);
 mark("rights_review");
 await setCaption(page,"Make risks visible. Keep uncertainty visible.","Deposits, prior liens, taxes, and owner authority require independent checks.",4300,"mock");
 mark("end");
 await writeFile(join(output,"chapter-cues.json"),JSON.stringify({schema:"directhome-film-cues-v1",
  synthetic:true,metaResponseSource:"verified pre-recorded model outputs",markers:events,
  rightsCandidates:count,listingCreated:!!listingId},null,2));
 const video=await page.video()?.path();
 await context.close();context=null;
 if(!video)throw Error("No recorder video");
 await copyFile(video,join(output,"directhome-three-chapter-raw.webm"));
 console.log("VIDEO_DONE",join(output,"directhome-three-chapter-raw.webm"));
}finally{
 if(context)await context.close().catch(()=>{});
 if(browser)await browser.close().catch(()=>{});
 server.kill("SIGTERM");
}
