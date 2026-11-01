import {test,expect} from "@playwright/test";
import {mintTestToken} from "../lib/auth.ts";
const SECRET=process.env.E2E_JWT_SECRET??"test-e2e-secret";
const token=(id:string)=>mintTestToken(id,id,"tenant",SECRET,Math.floor(Date.now()/1000)+3600);
const headers=(t:string)=>({Authorization:"Bearer "+t,"Content-Type":"application/json"});
test("실제 거래 현황: 양측 확인 카드를 통해서만 월세 조건 확정",async({page,request})=>{
 const suffix=test.info().project.name+"-"+Date.now();
 const owner=token("state-owner-"+suffix),visitor=token("state-visitor-"+suffix);
 const listing=await request.post("/api/listings",{headers:headers(owner),data:{
  title:"실거래 상태 검증",address:"서울시 가상 주소",tradeType:"월세",deposit:1000,rent:70,
  salePrice:0,fee:0,area:42,moveIn:"2026-12-01",publisher:"집주인",options:[],description:"합성 시나리오",
 }});
 expect(listing.status()).toBe(201);
 const lid=(await listing.json()).id;
 const room=await request.post("/api/deals/"+lid+"/rooms",{headers:headers(visitor),data:{}});
 expect(room.status()).toBe(201);
 const rid=(await room.json()).id;
 await page.addInitScript((v:string)=>localStorage.setItem("directhome.access_token",v),visitor);
 await page.goto("/rooms/"+rid);
 const progress=page.getByRole("region",{name:"거래 진행 요약"});
 await expect(progress).toBeVisible();
 await expect(progress.getByText("두 사람의 거래 진행")).toBeVisible();
 const form=progress.locator(".real-propose-details");
 await form.locator("summary").click();
 await form.locator("select").selectOption("월세 조건");
 await form.locator("input").fill("보증금 3,000만원 / 월세 68만원");
 await form.getByRole("button",{name:"확인 카드 만들기"}).click();
 const card=progress.locator(".real-proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"});
 await expect(card).toBeVisible();
 await expect(card).toContainText("양측 확인 대기");
 await card.getByRole("button",{name:"이 조건 동의"}).click();
 await expect(card).toContainText("내가 동의함");
 await expect(progress.locator(".real-stage").filter({hasText:"가격 조건"})).not.toContainText("양측 확인");
 await page.addInitScript((v:string)=>localStorage.setItem("directhome.access_token",v),owner);
 await page.goto("/rooms/"+rid);
 const ownerProgress=page.getByRole("region",{name:"거래 진행 요약"});
 const ownerCard=ownerProgress.locator(".real-proposal-card").filter({hasText:"보증금 3,000만원/월세 68만원"});
 await expect(ownerCard.getByRole("button",{name:"이 조건 동의"})).toBeVisible();
 await ownerCard.getByRole("button",{name:"이 조건 동의"}).click();
 await expect(ownerCard).toContainText("양측 동의");
 const price=ownerProgress.locator(".real-stage").filter({hasText:"가격 조건"});
 await expect(price).toContainText("양측 확인");
 await expect(price).toContainText("보증금 3,000만원/월세 68만원");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
