import {test,expect} from "@playwright/test";
import {mintTestToken} from "../lib/auth.ts";

const SECRET=process.env.E2E_JWT_SECRET??"test-e2e-secret";
const jwt=(id:string,role:string)=>mintTestToken(id,id,role,SECRET,Math.floor(Date.now()/1000)+3600);
const headers=(token:string)=>({Authorization:"Bearer "+token,"Content-Type":"application/json"});
function nextSaturday(){
 for(let n=1;n<9;n++){
  const day=new Date(Date.now()+n*86400000);
  const d=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(day);
  if(new Date(d+"T00:00:00Z").getUTCDay()===6)return d;
 }
 throw Error("No Saturday");
}
test("첫 화면에서 집주인 또는 집 찾기 이용 목적을 선택한다",async({page})=>{
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"어떤 목적으로 오셨나요?"})).toBeVisible();
 const visitor=page.getByRole("link",{name:/집을 구하시나요\? 매물 둘러보기/});
 const owner=page.getByRole("link",{name:/집주인이신가요\? 내 집 관리로 이동/});
 await expect(visitor).toBeVisible();
 await expect(owner).toBeVisible();
 await visitor.click();
 await expect(page).toHaveURL(/#properties$/);
 await expect(page.locator("#properties")).toBeVisible();
 await owner.click();
 await expect(page).toHaveURL(/\/owner$/);
 await expect(page.getByRole("heading",{name:"내 집 관리"})).toBeVisible();
});
test("실제 매물 60분 예약은 집주인 승인 후 확정되고 방문자가 취소한다",async({page,request})=>{
 const stamp=test.info().project.name+"-"+Date.now();
 const owner=jwt("visit-owner-"+stamp,"landlord");
 const visitor=jwt("visit-visitor-"+stamp,"tenant");
 const reg=await request.post("/api/listings",{headers:headers(owner),data:{
  title:"E2E 방문 예약 테스트",address:"서울시 테스트 주소",tradeType:"월세",deposit:2000,rent:80,
  salePrice:0,fee:5,area:42,moveIn:"2026-12-01",options:[],publisher:"테스트 집주인",description:"방문 예약 테스트",
 }});
 expect(reg.status()).toBe(201);const listingId=(await reg.json()).id;
 const policy=await request.put("/api/owner/listings/"+listingId+"/ai",{headers:headers(owner),data:{
  aiEnabled:true,visitMode:"approval",availability:[{weekday:6,start:"13:00",end:"18:00"}],
  answers:{pets:"고양이 가능",parking:"1대 가능",notes:""},
 }});
 expect(policy.ok()).toBeTruthy();
 const room=await request.post("/api/deals/"+listingId+"/rooms",{headers:headers(visitor),data:{}});
 expect(room.status()).toBe(201);const roomId=(await room.json()).id;
 await page.addInitScript((x:string)=>localStorage.setItem("directhome.access_token",x),visitor);
 await page.goto("/rooms/"+roomId);
 const panel=page.getByRole("region",{name:"방문 예약"});
 await expect(panel).toBeVisible();
 await panel.getByLabel("방문 날짜").fill(nextSaturday());
 await panel.getByLabel("방문 시간").selectOption("13:00");
 await panel.getByRole("button",{name:"방문 예약 요청"}).click();
 await expect(panel.getByText("집주인 승인 대기").first()).toBeVisible();
 await page.evaluate((x:string)=>localStorage.setItem("directhome.access_token",x),owner);
 await page.goto("/owner");
 const bookings=page.getByRole("region",{name:"방문 예약 관리"});
 await expect(bookings.getByText("E2E 방문 예약 테스트")).toBeVisible();
 await bookings.getByRole("button",{name:"승인"}).click();
 await expect(bookings.getByText("방문 확정")).toBeVisible();
 await page.evaluate((x:string)=>localStorage.setItem("directhome.access_token",x),visitor);
 await page.goto("/rooms/"+roomId);
 await expect(page.getByRole("region",{name:"방문 예약"}).getByText("방문 확정")).toBeVisible();
 await panel.getByRole("button",{name:"예약 취소"}).click();
 await expect(panel.getByText("취소됨")).toBeVisible();
});
