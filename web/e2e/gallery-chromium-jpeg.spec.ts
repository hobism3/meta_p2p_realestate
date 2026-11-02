import { test, expect } from "@playwright/test";
import { mintTestToken } from "../lib/auth.ts";

test("real Chromium Canvas JPEG with ICC metadata publishes through strict server validation",async({page,request})=>{
  const owner=mintTestToken("gallery-owner-"+Date.now(), "Synthetic Owner", "landlord",
    process.env.E2E_JWT_SECRET??"test-e2e-secret", Math.floor(Date.now()/1000)+3600);
  const headers={Authorization:"Bearer "+owner,"Content-Type":"application/json"};
  const l=await request.post("/api/listings",{headers,data:{
    title:"Synthetic gallery test",address:"Synthetic address 123",tradeType:"월세",
    deposit:1200,rent:66,salePrice:0,fee:0,area:43,moveIn:"2026-12-01",
    publisher:"Synthetic Owner",options:[],description:"CI fixture",
  }});
  expect(l.status()).toBe(201);
  const id=(await l.json()).id as string;
  let paidCalls=0;
  await page.route("**/api/listings/photo-review",route=>{
    if(route.request().method()==="POST")paidCalls++;
    return route.fulfill({json:{enabled:false}});
  });
  await page.route("**/api/listings/photo-empty-view",route=>{
    if(route.request().method()==="POST")paidCalls++;
    return route.fulfill({json:{enabled:false}});
  });
  await page.addInitScript(t=>localStorage.setItem("directhome.access_token",t),owner);
  await page.goto("/owner/listings/"+id);
  await expect(page.getByRole("heading",{name:"사진으로 우리 집 정보 정리하기"})).toBeVisible();
  const base64=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=960;c.height=640;
    const x=c.getContext("2d");
    if(!x)throw Error("Canvas unavailable");
    x.fillStyle="#e4dbca";x.fillRect(0,0,960,640);
    x.fillStyle="#698baa";x.fillRect(520,50,280,240);
    x.fillStyle="#8c796b";x.fillRect(170,350,520,130);
    return c.toDataURL("image/jpeg",.84).split(",")[1];
  });
  const input=Buffer.from(base64,"base64");
  // Canvas may embed an ICC profile; test the actual browser's JPEG bytes.
  const hasIcc=input.includes(Buffer.from("ICC_PROFILE"));
  console.log("CHROMIUM_CANVAS_ICC_PRESENT",hasIcc);
  await page.locator(".photo-guide input[type=file]").setInputFiles({
    name:"synthetic-room-real-api.jpg",mimeType:"image/jpeg",buffer:input,
  });
  await expect(page.getByText("synthetic-room-real-api.jpg")).toBeVisible();
  await page.getByRole("checkbox",{name:/검토한 게시용 JPEG 사진 공개/}).check();
  const resultPromise=page.waitForResponse(r=>r.url().endsWith("/gallery")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"검토한 사진 공개하기"}).click();
  const result=await resultPromise;
  expect(result.status(),await result.text()).toBe(201);
  await expect(page.getByRole("button",{name:/게시 완료/})).toBeVisible();
  const photos=await request.get("/api/listings/"+id+"/gallery");
  expect(photos.status()).toBe(200);
  expect((await photos.json()).photos).toHaveLength(1);
  expect(paidCalls).toBe(0);
});
