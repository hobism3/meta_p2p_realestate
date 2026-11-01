import {test,expect} from "@playwright/test";
import {mintTestToken} from "../lib/auth";

const SECRET=process.env.E2E_JWT_SECRET??"test-e2e-secret";
const bearer=(sub:string,role:string)=>mintTestToken(sub,sub,role,SECRET,Math.floor(Date.now()/1000)+3600);
test("실제 집주인 대리 응대: 방문자 문의를 확인함에서 답변하고 거래방에서 확인",async({page,request})=>{
 const suffix=test.info().project.name+"-"+Date.now();
 const owner=bearer("owner-ui-"+suffix,"landlord"),visitor=bearer("visitor-ui-"+suffix,"tenant");
 const json=(token:string)=>({Authorization:"Bearer "+token,"Content-Type":"application/json"});
 const create=await request.post("/api/listings",{headers:json(owner),data:{
  title:"AI 대리 확인 시연 매물 "+suffix,address:"서울시 신림동 테스트주소",
  tradeType:"월세",deposit:1800,rent:78,salePrice:0,fee:0,area:48,
  moveIn:"2026-12-01",publisher:"테스트 임대인",options:["에어컨"],description:"합성 테스트",
 }});
 expect(create.status()).toBe(201);
 const lid=(await create.json()).id as string;
 const setting=await request.put("/api/owner/listings/"+lid+"/ai",{headers:json(owner),
  data:{aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
   answers:{pets:"고양이 가능",parking:"주차 1대 가능",notes:""}}});
 expect(setting.ok()).toBeTruthy();
 const room=await request.post("/api/deals/"+lid+"/rooms",{headers:json(visitor),data:{}});
 expect(room.status()).toBe(201);
 const rid=(await room.json()).id as string;
 const speak=await request.post("/api/rooms/"+rid+"/messages",{headers:json(visitor),data:{text:"보증금 올리고 월세 낮춰주실 수 있나요?"}});
 expect(speak.status()).toBe(201);
 const outcome=await request.post("/api/rooms/"+rid+"/owner-agent/invoke",{headers:json(visitor),data:{trigger_message_id:(await speak.json()).id}});
 expect(outcome.ok()).toBeTruthy();
 expect((await outcome.json()).outcome).toBe("handoff");
 await page.addInitScript((value:string)=>window.localStorage.setItem("directhome.access_token",value),owner);
 await page.goto("/owner");
 await expect(page.getByRole("heading",{name:/직접 확인할 문의/})).toBeVisible();
 const item=page.locator(".owner-attention-item").filter({hasText:"보증금 올리고 월세 낮춰주실 수 있나요?"});
 await expect(item).toBeVisible();
 await item.locator("textarea").fill("조건 변경은 직접 만나 확인하겠습니다.");
 await item.getByRole("button",{name:"집주인 답변 전송"}).click();
 await expect(item).toHaveCount(0);
 const reply=(await (await request.get("/api/rooms/"+rid+"/messages",{headers:json(visitor)})).json()) as Array<{author_type:string;text:string}>;
 expect(reply.some(m=>m.author_type==="human"&&m.text==="조건 변경은 직접 만나 확인하겠습니다.")).toBeTruthy();
 await page.goto("/owner/listings/"+lid);
 await expect(page.getByText(/AI 대리 응대 켜기/)).toBeVisible();
 await expect(page.getByLabel("반려동물 정책")).toHaveValue("고양이 가능");
});
test("실제 거래방은 AI 집주인 대리인을 AI라고 구분해 보여준다",async({page,request})=>{
 const suffix=test.info().project.name+"-display-"+Date.now();
 const owner=bearer("own-"+suffix,"landlord"),visitor=bearer("vis-"+suffix,"tenant");
 const headers=(token:string)=>({Authorization:"Bearer "+token,"Content-Type":"application/json"});
 const l=await request.post("/api/listings",{headers:headers(owner),data:{
  title:"AI 응대 표시 확인",address:"서울시 가상지역",tradeType:"월세",
  deposit:1000,rent:60,salePrice:0,fee:0,area:37,moveIn:"2026-12-01",
  options:[],publisher:"집주인",description:"합성",
 }});
 const lid=(await l.json()).id;
 await request.put("/api/owner/listings/"+lid+"/ai",{headers:headers(owner),data:{
  aiEnabled:true,visitMode:"approval",availability:[],
  answers:{pets:"고양이 가능",parking:"",notes:""},
 }});
 const room=await request.post("/api/deals/"+lid+"/rooms",{headers:headers(visitor),data:{}});
 const rid=(await room.json()).id;
 const m=await request.post("/api/rooms/"+rid+"/messages",{headers:headers(visitor),data:{text:"고양이 키워도 되나요?"}});
 await request.post("/api/rooms/"+rid+"/owner-agent/invoke",{headers:headers(visitor),data:{trigger_message_id:(await m.json()).id}});
 await page.addInitScript((v:string)=>localStorage.setItem("directhome.access_token",v),visitor);
 await page.goto("/rooms/"+rid);
 await expect(page.getByRole("log",{name:"거래 대화"})).toContainText("AI 집주인 대리인");
 await expect(page.getByRole("log",{name:"거래 대화"})).toContainText("고양이 가능");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
