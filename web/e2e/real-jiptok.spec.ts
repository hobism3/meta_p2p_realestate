import {test,expect} from "@playwright/test";
import {mintTestToken} from "../lib/auth.ts";
const SECRET=process.env.E2E_JWT_SECRET??"test-e2e-secret";
const tok=(id:string)=>mintTestToken(id,id,"tenant",SECRET,Math.floor(Date.now()/1000)+3600);
const headers=(t:string)=>({Authorization:"Bearer "+t,"Content-Type":"application/json"});
test("실거래 그룹채팅에서 집톡이가 제안 카드·양측 확인·계약 절차를 안내",async({page,request})=>{
 const suffix=test.info().project.name+"-"+Date.now();
 const owner=tok("jiptok-owner-"+suffix),visitor=tok("jiptok-visitor-"+suffix);
 const listing=await request.post("/api/listings",{headers:headers(owner),data:{
  title:"실거래 집톡이 검증",address:"서울 가상 주소",tradeType:"월세",deposit:1800,rent:78,
  salePrice:0,fee:0,area:45,moveIn:"2026-12-01",publisher:"집주인",options:[],description:"합성 검증",
 }});
 expect(listing.status()).toBe(201);
 const lid=(await listing.json()).id;
 const room=await request.post("/api/deals/"+lid+"/rooms",{headers:headers(visitor),data:{}});
 expect(room.status()).toBe(201);
 const rid=(await room.json()).id;
 const msg=await request.post("/api/rooms/"+rid+"/messages",{
  headers:headers(owner),data:{text:"보증금 3,000만원 / 월세 68만원이면 괜찮습니다."},
 });
 expect(msg.status()).toBe(201);
 await page.addInitScript((id:string)=>localStorage.setItem("directhome.access_token",id),visitor);
 await page.goto("/rooms/"+rid);
 const feed=page.getByRole("log",{name:"거래 대화"});
 await expect(feed.getByText("집톡이 · 거래 진행 도우미")).toBeVisible();
 const inline=feed.locator(".proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"});
 await expect(inline).toBeVisible();
 await expect(inline).toContainText("동의 대기");
 const progress=page.getByRole("region",{name:"거래 진행 요약"});
 await expect(progress.locator(".real-stage").filter({hasText:"가격 조건"})).not.toContainText("양측 확인");
 await inline.getByRole("button",{name:"동의하기"}).click();
 await expect(inline).toContainText("상대방의 동의를 기다립니다.");
 await page.addInitScript((id:string)=>localStorage.setItem("directhome.access_token",id),owner);
 await page.goto("/rooms/"+rid);
 const ownerFeed=page.getByRole("log",{name:"거래 대화"});
 const ownerInline=ownerFeed.locator(".proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"});
 await expect(ownerInline.getByRole("button",{name:"동의하기"})).toBeVisible();
 await ownerInline.getByRole("button",{name:"동의하기"}).click();
 await expect(ownerInline).toContainText("양측 동의");
 await expect(page.getByRole("region",{name:"거래 진행 요약"})
  .locator(".real-stage").filter({hasText:"가격 조건"})).toContainText("양측 확인");
 await expect(ownerFeed.getByText(/두 분 모두 동의하셨어요/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))
  .toBeLessThanOrEqual(0);
});
test("고양이 문의는 집톡이의 확인 안내일 뿐 일방적 확정이 아님",async({page,request})=>{
 const suffix=test.info().project.name+"-"+Date.now();
 const owner=tok("pet-owner-"+suffix),visitor=tok("pet-visitor-"+suffix);
 const listing=await request.post("/api/listings",{headers:headers(owner),data:{
  title:"반려동물 확인 검증",address:"서울 가상 주소",tradeType:"월세",deposit:1200,rent:55,
  salePrice:0,fee:0,area:32,moveIn:"2026-12-01",publisher:"집주인",options:[],description:"합성",
 }});
 expect(listing.status()).toBe(201);
 const lid=(await listing.json()).id;
 const room=await request.post("/api/deals/"+lid+"/rooms",{headers:headers(visitor),data:{}});
 expect(room.status()).toBe(201);
 const rid=(await room.json()).id;
 const msg=await request.post("/api/rooms/"+rid+"/messages",{headers:headers(visitor),data:{text:"고양이 키워도 되나요?"}});
 expect(msg.status()).toBe(201);
 await page.addInitScript((t:string)=>localStorage.setItem("directhome.access_token",t),visitor);
 await page.goto("/rooms/"+rid);
 const feed=page.getByRole("log",{name:"거래 대화"});
 await expect(feed.getByText(/반려동물 얘기가 나왔네요/)).toBeVisible();
 await expect(page.getByRole("region",{name:"거래 진행 요약"})
  .locator(".real-stage").filter({hasText:"옵션·생활 조건"})).not.toContainText("양측 확인");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))
  .toBeLessThanOrEqual(0);
});
