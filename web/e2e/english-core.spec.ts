import {test,expect} from "@playwright/test";
import {mintTestToken} from "../lib/auth.ts";
const secret=process.env.E2E_JWT_SECRET??"test-e2e-secret";
const token=(id:string)=>mintTestToken(id,id,"tenant",secret,Math.floor(Date.now()/1000)+3600);
const headers=(t:string)=>({Authorization:"Bearer "+t,"Content-Type":"application/json"});

test("English core experience: homepage, registration, photo studio and account entry",async({page})=>{
 await page.goto("/showcase?lang=en");
 await expect(page.getByRole("heading",{name:/From listing a home/})).toBeVisible();
 await page.goto("/");
 await expect(page.getByRole("heading",{name:/What would you like to do/})).toBeVisible();
 await page.getByRole("link",{name:"List a home"}).click();
 await expect(page.getByRole("heading",{name:/The easiest way to introduce your home/})).toBeVisible();
 await page.getByRole("button",{name:/Start from scratch/}).click();
 await expect(page.getByRole("heading",{name:/Tell us about the space/})).toBeVisible();
 await page.locator("#title").fill("Synthetic English demo");
 await page.locator("#address").fill("Fictional Seoul address");
 await page.locator("#area").fill("35");
 await page.getByRole("button",{name:/Continue/}).click();
 await expect(page.getByRole("heading",{name:/What are your terms/})).toBeVisible();
 await page.locator("#deposit").fill("1800");
 await page.locator("#rent").fill("75");
 await page.getByRole("button",{name:/Continue/}).click();
 await expect(page.getByRole("heading",{name:/Organize your home with photos/})).toBeVisible();
 await expect(page.getByRole("checkbox",{name:/sending selected photos to Meta Vision/})).toBeVisible();
 await expect(page.getByRole("checkbox",{name:/sending selected photos to Meta Muse Image/})).toBeVisible();
 await page.goto("/login");
 await expect(page.getByRole("heading",{name:/Welcome back/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("English neutral Jiptok summary shows pending before bilateral confirmation",async({page,request})=>{
 const suffix=Date.now()+"-"+test.info().project.name;
 const owner=token("en-jiptok-owner-"+suffix),visitor=token("en-jiptok-visitor-"+suffix);
 const listing=await request.post("/api/listings",{headers:headers(owner),data:{
  title:"English Jiptok synthetic room",address:"Synthetic street",tradeType:"월세",
  deposit:1600,rent:73,salePrice:0,fee:0,area:43,moveIn:"2026-12-01",
  publisher:"Demo owner",options:[],description:"Synthetic demo only",
 }});
 expect(listing.status()).toBe(201);
 const listingId=(await listing.json()).id as string;
 const room=await request.post("/api/deals/"+listingId+"/rooms",{headers:headers(visitor),data:{}});
 expect(room.status()).toBe(201);
 const rid=(await room.json()).id as string;
 const sent=await request.post("/api/rooms/"+rid+"/messages",{headers:headers(owner),
  data:{text:"보증금 3,000만원 / 월세 68만원이면 괜찮습니다."}});
 expect(sent.status()).toBe(201);
 await page.addInitScript((accessToken)=>{
  localStorage.setItem("directhome.access_token",accessToken);
  localStorage.setItem("directhome.ui.locale","en");
 },visitor);
 await page.goto("/rooms/"+rid);
 await expect(page.locator("html")).toHaveAttribute("lang","en");
 await expect(page.getByRole("heading",{name:"Jiptok's deal summary"})).toBeVisible();
 await expect(page.getByText("Still to confirm")).toBeVisible();
 await expect(page.getByText(/not a legally binding contract/i).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
