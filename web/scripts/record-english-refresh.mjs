/** Fresh English product capture. Existing Korean Jiptok segment is kept separately.
 * Local isolated SQLite; fictional PDF/identities; verified Meta responses replayed.
 * This script never writes to production or makes a paid model request.
 */
import { chromium } from '@playwright/test';
import { createHash, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'demo-artifacts/english-refresh');
const source=join(root,'demo-artifacts/dynamic/source');
const base='http://127.0.0.1:3159';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const digest=b=>createHash('sha256').update(b).digest('hex');
const inputs={
 'rights-study-synthetic.pdf':'7624c8384271e6ebd5bc092263066432db3656b74454272d9fb33a5144d59403',
 'source_meta_generated.jpg':'af59759ed94169864d77587608dcc8f88e87b74f75f591351a06f883390a47c5',
 'empty_view_actual.webp':'23fdd7e442487566dc05052b94aad69065bec2aaba40e9ae3919b15bdf221ded',
 'vision_actual.json':'bd1d481ea74a9d6edf44c48da9cdd41528e974a7d55ac1c4703e923ce4078f1d',
 'DirectHome_3Chapters_Kokoro_English_Chat_Captions_20261103.mp4':'3537e1b20eee944ab693e2c4b655424dbb36788c5201bfc9a37799f8ba9634aa',
};
await mkdir(source,{recursive:true});
for(const [name,hash] of Object.entries(inputs)){
 let bytes;
 try{bytes=await readFile(join(source,name));}catch(e){
  if(e.code!=='ENOENT'||!process.argv.includes('--fetch-source'))throw e;
  const response=await fetch('https://github.com/hobism3/meta_p2p_realestate/releases/download/directhome-three-chapter-demo-20261103/'+name);
  if(!response.ok)throw Error('Evidence download failed: '+name);
  bytes=Buffer.from(await response.arrayBuffer());
  if(digest(bytes)!==hash)throw Error('Downloaded evidence checksum mismatch: '+name);
  await writeFile(join(source,name),bytes);
 }
 if(digest(bytes)!==hash)throw Error('Evidence checksum mismatch: '+name);
}
const pdf=await readFile(join(source,'rights-study-synthetic.pdf'));
const original=await readFile(join(source,'source_meta_generated.jpg'));
const edited=await readFile(join(source,'empty_view_actual.webp'));
const vision=JSON.parse(await readFile(join(source,'vision_actual.json'),'utf8'));
if(digest(pdf)!=='7624c8384271e6ebd5bc092263066432db3656b74454272d9fb33a5144d59403' ||
   digest(original)!=='af59759ed94169864d77587608dcc8f88e87b74f75f591351a06f883390a47c5' ||
   digest(edited)!=='23fdd7e442487566dc05052b94aad69065bec2aaba40e9ae3919b15bdf221ded' ||
   vision.sourceSha256!==digest(original) || vision.provider!=='meta')throw Error('Evidence checksum/provider mismatch');
await mkdir(out,{recursive:true});
const accessToken=()=>{
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const h=enc({alg:'HS256',typ:'JWT'});
 const p=enc({sub:'english-video-owner-'+process.pid,exp:Math.floor(Date.now()/1000)+3600,user_metadata:{name:'Synthetic demo owner'}});
 return h+'.'+p+'.'+createHmac('sha256','test-e2e-secret').update(h+'.'+p).digest('base64url');
};
const serverLog=createWriteStream(join(out,'server.log'));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3159'],{
 cwd:root,env:{...process.env,DATABASE_URL:'',DB_PATH:`./data/english-video-${process.pid}.db`,
 SUPABASE_JWT_SECRET:'test-e2e-secret',AGENT_PROVIDER:'mock',RATE_LIMIT_PER_MIN:'1000'},stdio:['ignore','pipe','pipe'],
});
server.stdout.pipe(serverLog);server.stderr.pipe(serverLog);
let browser,context,page,epoch;
const shots=[],issues=[];
async function english(){
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 await page.evaluate(()=>document.fonts.ready);
 await delay(350);
}
async function badge(kind){
 await page.evaluate(kind=>{
  document.getElementById('capture-provenance')?.remove();
  const el=document.createElement('aside');el.id='capture-provenance';
  el.textContent=kind==='meta'?'Recorded Meta output · replay of a genuine captured response':
   kind==='local'?'Fictional source PDF · browser-local extraction · not legal verification':
   'Fictional sample · Mock document extraction';
  Object.assign(el.style,{position:'fixed',right:'14px',top:'65px',zIndex:'2147483000',
   font:'600 11px/1.4 system-ui',background:'#e8f4dc',color:'#274432',padding:'7px 12px',
   border:'1px solid #c5d8b8',borderRadius:'20px',pointerEvents:'none'});
  document.body.append(el);
 },kind);
}
async function audit(name){
 const untranslated=await page.evaluate(()=>{
  const items=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const node=walker.currentNode,el=node.parentElement;
   if(!el||el.closest('[data-source-text],[data-registry-source],textarea,script,style,[hidden]'))continue;
   if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
   const value=node.textContent.trim().replace(/\s+/g,' ');
   if(/[가-힣]/.test(value))items.push({tag:el.tagName,text:value.slice(0,300)});
  }
  return items;
 });
 if(untranslated.length){issues.push({name,untranslated});console.log('UNTRANSLATED',name,JSON.stringify(untranslated));}
 return untranslated;
}
async function shot(name,locator,hold=2800){
 if(locator){
  // Put the subject near the top, not merely barely visible at the bottom edge.
  await locator.evaluate(el=>window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-96),behavior:'instant'}));
  await delay(400);
 }
 await audit(name);
 const at=(Date.now()-epoch)/1000;
 await page.screenshot({path:join(out,name+'.png')});
 shots.push({name,start:at});
 console.log('SHOT',name,at.toFixed(3));
 await delay(hold);
 shots.at(-1).end=(Date.now()-epoch)/1000;
}
try{
 let ready=false;
 for(let i=0;i<60;i++){
  if(server.exitCode!==null)throw Error('Local capture server exited');
  try{const h=await fetch(base+'/api/health');if(h.ok){const info=await h.json();if(info.kind!=='sqlite')throw Error('Not an isolated SQLite server');ready=true;break;}}catch(e){if(e.message.includes('SQLite'))throw e;}
  await delay(1000);
 }
 if(!ready)throw Error('Local capture server not ready');
 browser=await chromium.launch({headless:true});
 context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:720},deviceScaleFactor:1,
  recordVideo:{dir:out,size:{width:1280,height:720}}});
 await context.addInitScript(token=>{
  localStorage.setItem('directhome.ui.locale','en');
  localStorage.setItem('directhome.access_token',token);
 },accessToken());
 // Abort any external connection; replay only the independently captured photo outputs.
 await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
  return route.abort('blockedbyclient');
 });
 await context.route('**/api/listings/photo-review',route=>route.fulfill({json:route.request().method()==='GET'?
  {enabled:true,provider:'meta',model:'muse-spark-1.3'}:{provider:'meta',model:'muse-spark-1.3',review:vision.review}}));
 await context.route('**/api/listings/photo-empty-view',route=>route.fulfill({json:route.request().method()==='GET'?
  {enabled:true,model:'muse-image-1.0'}:{provider:'meta',model:'muse-image-1.0',kind:'ai_simulation',image:'data:image/webp;base64,'+edited.toString('base64')}}));
 epoch=Date.now();
 page=await context.newPage();page.setDefaultTimeout(20000);
 await page.goto(base+'/register?lang=en');await english();await badge('mock');
 await shot('01-register',page.getByRole('heading',{name:'Start a listing draft from a registry PDF'}));
 await page.locator('#registry-pdf').setInputFiles({name:'fictional-korean-registry.pdf',mimeType:'application/pdf',buffer:pdf});
 await page.locator('.registry-consent input').check();
 await shot('02-upload',page.getByRole('button',{name:'Extract draft property details'}));
 await page.getByRole('button',{name:'Extract draft property details'}).click();
 const extracted=page.getByRole('heading',{name:'Review the extracted draft'});
 await extracted.waitFor();await shot('03-draft',extracted,3500);
 await page.getByRole('button',{name:'Fill empty listing fields'}).click();
 if(!(await page.locator('#address').inputValue()).trim()||await page.locator('#area').inputValue()!=='59.84')throw Error('Document prefill failed');
 await shot('04-prefilled',page.locator('#wizard-stage-heading'));
 await page.getByRole('button',{name:'Continue'}).click();
 await page.locator('#deposit').fill('2000');await page.locator('#rent').fill('85');
 await shot('05-terms',page.locator('#wizard-stage-heading'));
 await page.getByRole('button',{name:'Continue'}).click();
 await page.locator('#moveIn').fill('2026-12-01');await page.locator('#publisher').fill('Synthetic Demo Owner');
 await page.locator('.photo-guide input[type=file]').setInputFiles({name:'meta-generated-living-room.jpg',mimeType:'image/jpeg',buffer:original});
 await badge('meta');
 await shot('06-photo',page.getByRole('heading',{name:'Organize your home with photos'}));
 await page.getByRole('checkbox',{name:/sending selected photos to Meta Vision/}).check();
 await page.getByRole('button',{name:'Analyze this photo'}).click();
 const findings=page.getByRole('heading',{name:/AI findings from 1 photo/});await findings.waitFor();
 await shot('07-vision',findings,4000);
 await page.locator('.photo-guide-option-chips .feature-chip').filter({hasText:'Air conditioner'}).click();
 await page.getByRole('button',{name:/Add selected 1/}).click();
 await shot('08-option',findings);
 await page.getByRole('checkbox',{name:/sending selected photos to Meta Muse Image/}).check();
 await page.getByRole('button',{name:'Preview empty room',exact:true}).click();
 const comparison=page.locator('.photo-guide-comparison');await comparison.waitFor();
 await shot('09-comparison',comparison,5000);
 await page.getByRole('button',{name:'Continue'}).click();await badge('mock');
 await shot('10-review',page.locator('#wizard-stage-heading'));
 await page.getByRole('button',{name:'Save listing'}).click();
 const saved=page.getByRole('heading',{name:'Listing saved.',exact:true});await saved.waitFor();
 await shot('11-saved',saved);
 await page.goto(base+'/registry/extract?lang=en');await english();await badge('local');
 await shot('12-rights-start',page.getByRole('heading',{name:'1. Extract PDF text locally'}));
 await page.getByLabel('Choose local PDF').setInputFiles({name:'fictional-korean-registry.pdf',mimeType:'application/pdf',buffer:pdf});
 const rows=page.locator('section[aria-live=polite] article.card');
 await rows.first().waitFor();
 const count=await rows.count();if(count!==3)throw Error('Expected 3 rights candidates, got '+count);
 await shot('13-local-text',page.locator('textarea'),3500);
 await shot('14-candidates',rows.first(),4000);
 for(let i=0;i<count;i++){
  await rows.nth(i).locator('select').selectOption('active');
  await rows.nth(i).locator('input[type=checkbox]').check();
 }
 await shot('15-reviewed',rows.nth(1),4000);
 const transfer=page.getByRole('button',{name:/Send reviewed facts/});
 if(await transfer.isDisabled())throw Error('Reviewed rights transfer blocked');
 await transfer.click();await english();await badge('local');
 await shot('16-checklist',page.getByRole('heading',{name:'4. Checks beyond the registry'}),3500);
 await shot('17-findings',page.getByRole('heading',{name:'5. Review findings'}),5000);
 await shot('18-findings-detail',page.locator('section[aria-live=polite] article.card').first(),4000);
 const video=page.video();await context.close();context=null;
 await copyFile(await video.path(),join(out,'fresh-english-ui.webm'));
 await writeFile(join(out,'capture-manifest.json'),JSON.stringify({schema:'directhome-english-refresh-v1',
  viewport:[1280,720],locale:'en-US',synthetic:true,rightsCandidates:count,listingCreated:true,
  sourcePdfSha256:digest(pdf),metaImageSha256:digest(original),metaEditedSha256:digest(edited),inputSha256:inputs,
  metaResponse:'verified recorded response replay, no new request',shots,translationIssues:issues},null,2));
 if(issues.length)throw Error(`Untranslated UI found in ${issues.length} shots; see capture-manifest.json`);
 console.log('ENGLISH_CAPTURE_OK',out);
}catch(e){
 if(page&&!page.isClosed())await page.screenshot({path:join(out,'capture-failure.png')}).catch(()=>{});
 await writeFile(join(out,'capture-diagnostics.json'),JSON.stringify({shots,translationIssues:issues,error:String(e)},null,2));
 throw e;
}finally{
 if(context)await context.close().catch(()=>{});
 if(browser)await browser.close().catch(()=>{});
 server.kill();serverLog.end();
}
