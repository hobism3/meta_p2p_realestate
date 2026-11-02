import { expect, test } from "@playwright/test";

/** Entire flow is synthetic. Browser routes stub paid Meta endpoints; no API credit or real photos. */
async function reachPhotoStep(page: import("@playwright/test").Page) {
  await page.goto("/register");
  await page.getByRole("button", {name:/직접 입력해서 시작/}).click();
  await page.locator("#title").fill("가상의 테스트 주택");
  await page.locator("#address").fill("서울 가상구 테스트로 1");
  await page.locator("#area").fill("26");
  await page.getByRole("button", {name:/다음 단계/}).click();
  await page.locator("#deposit").fill("500");
  await page.locator("#rent").fill("60");
  await page.getByRole("button", {name:/다음 단계/}).click();
  await expect(page.getByRole("heading", {name:"사진으로 우리 집 정보 정리하기"})).toBeVisible();
}

async function generatedImage(page: import("@playwright/test").Page, format: "image/jpeg" | "image/webp") {
  const encoded = await page.evaluate((format) => {
    const c = document.createElement("canvas"); c.width = 800; c.height = 600;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas missing");
    ctx.fillStyle = "#ddd0c1"; ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#887262"; ctx.fillRect(40, 250, 720, 280);
    ctx.fillStyle = "#91b7d6"; ctx.fillRect(550, 20, 200, 180);
    return c.toDataURL(format, 0.7).split(",")[1];
  }, format);
  return Buffer.from(encoded,"base64");
}

test("사진 등록: 전체 분석 후 옵션 후보·욕실 사진 누락 제안, 집주인의 확인 반영만 허용", async ({page}) => {
  let calls = 0;
  await page.route("**/api/listings/photo-review", async (route) => {
    if(route.request().method()==="GET")
      return route.fulfill({json:{enabled:true,provider:"meta",maxImagesPerHour:6}});
    calls++;
    return route.fulfill({json:{provider:"meta",review:{
      room:"kitchen",features:["냉장고","에어컨","싱크대"],privacyFlags:[],
    }}});
  });
  await page.route("**/api/listings/photo-empty-view", async (route) =>
    route.fulfill({json:{enabled:false,model:"muse-image-1.0"}}));
  await reachPhotoStep(page);
  const blob=await generatedImage(page,"image/jpeg");
  await page.locator('.photo-guide input[type="file"]').setInputFiles({
    name:"synthetic-room.jpg",mimeType:"image/jpeg",buffer:blob,
  });
  await expect(page.getByText("synthetic-room.jpg")).toBeVisible();
  await page.getByRole("button",{name:"개인 물품 가리기"}).click();
  const maskCanvas=page.locator(".photo-guide-mask canvas");
  await maskCanvas.scrollIntoViewIfNeeded();
  const rect=await maskCanvas.boundingBox();
  expect(rect).not.toBeNull();
  if(!rect)throw new Error("No canvas bounds");
  await page.mouse.move(rect.x + rect.width * 0.18, rect.y + rect.height * 0.20);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.52, rect.y + rect.height * 0.45,{steps:5});
  await page.mouse.up();
  await page.getByRole("button",{name:"가림 적용"}).click();
  await expect(page.getByText("개인 영역 가림 적용")).toBeVisible();
  expect(calls).toBe(0); // Selecting a photo or covering private areas must not call Meta.
  await expect(page.getByRole("button",{name:"이 사진 AI 분석"})).toBeDisabled();
  await page.getByRole("checkbox",{name:/매물 정보 초안 추출/}).check();
  await page.getByRole("button",{name:"이 사진 AI 분석"}).click();
  await expect(page.getByRole("heading",{name:/AI가 사진 1장에서 찾아낸 내용/})).toBeVisible();
  await expect(page.getByText(/욕실 사진은 아직 확인되지 않았어요/)).toBeVisible();
  await expect(page.getByText(/생활 공간\(거실·침실\) 사진은 아직 확인되지 않았어요/)).toBeVisible();
  await expect(page.locator(".photo-guide-option-chips .feature-chip")).toHaveCount(2);
  await expect(page.locator("#options")).toHaveValue("");
  await page.locator(".photo-guide-option-chips .feature-chip").filter({hasText:"냉장고"}).click();
  await page.getByRole("button",{name:/선택한 1개를 매물 옵션 입력란에 추가/}).click();
  await expect(page.locator("#options")).toHaveValue("냉장고");
  await page.locator("#moveIn").fill("협의 가능");
  await page.locator("#publisher").fill("가상 집주인");
  await page.getByRole("button",{name:/다음 단계/}).click();
  await expect(page.getByRole("heading",{name:/등록 전에 한 번만/})).toBeVisible();
  await page.getByRole("button",{name:/이전/}).click();
  await expect(page.getByText("synthetic-room.jpg")).toBeVisible();
  await expect(page.getByText(/욕실 사진은 아직 확인되지 않았어요/)).toBeVisible();
  expect(calls).toBe(1);
});
test("가구 없는 공간 보기: 별도 동의, 원본과 AI 결과 병치, 시뮬레이션 표시",async({page})=>{
  await page.route("**/api/listings/photo-review", async (route) =>
    route.fulfill({json:{enabled:false}}));
  let editCalls=0;
  const edited=await generatedImage(page,"image/webp");
  await page.route("**/api/listings/photo-empty-view",async(route)=>{
    if(route.request().method()==="GET")return route.fulfill({json:{enabled:true,model:"muse-image-1.0"}});
    editCalls++;
    const body=route.request().postDataJSON();
    expect(body.purpose).toBe("empty-room-preview");
    expect(body.consent).toBe(true);
    return route.fulfill({json:{kind:"ai_simulation",provider:"meta",
      image:"data:image/webp;base64,"+edited.toString("base64")}});
  });
  await reachPhotoStep(page);
  await page.locator('.photo-guide input[type="file"]').setInputFiles({
    name:"synthetic-furnished.jpg",mimeType:"image/jpeg",buffer:await generatedImage(page,"image/jpeg"),
  });
  const button=page.getByRole("button",{name:"가구 없는 모습 미리보기"});
  await expect(button).toBeDisabled();
  await page.getByRole("checkbox",{name:/AI 가상 이미지 생성을 위해/}).check();
  await button.click();
  await expect(page.locator(".photo-guide-comparison img")).toHaveCount(2);
  await expect(page.getByText("AI 가상 이미지 · 실제 모습 아님")).toBeVisible();
  await expect(page.getByText(/실제 면적, 구조, 하자 상태/)).toBeVisible();
  expect(editCalls).toBe(1);
});

test("가상 시연 사진을 서버 저장 없이 불러와 사용자 동의 전에는 모델을 호출하지 않는다", async ({page}) => {
  let paidCalls = 0;
  await page.route("**/api/listings/photo-review", async (route) => {
    if (route.request().method() === "POST") paidCalls++;
    return route.fulfill({json:{enabled:true,provider:"meta",maxImagesPerHour:1}});
  });
  await page.route("**/api/listings/photo-empty-view", async route =>
    route.fulfill({json:{enabled:false}}));
  await reachPhotoStep(page);
  for (const room of ["거실", "주방", "라운지"]) {
    await page.getByRole("button",{name:room + " 예시 사진 추가"}).click();
  }
  await expect(page.getByText("synthetic-demo-living.jpg")).toBeVisible();
  await expect(page.getByText("synthetic-demo-kitchen.jpg")).toBeVisible();
  await expect(page.getByText("synthetic-demo-lounge.jpg")).toBeVisible();
  await expect(page.locator(".photo-guide-item")).toHaveCount(3);
  await expect(page.getByRole("button",{name:"이 사진 AI 분석"})).toHaveCount(3);
  for (const button of await page.getByRole("button",{name:"이 사진 AI 분석"}).all()) await expect(button).toBeDisabled();
  expect(paidCalls).toBe(0);
});


test("등록 성공 후 같은 사진을 유지하고 별도 공개 동의 후에만 갤러리로 게시한다",async({page})=>{
  let photoPosts=0, listingPosts=0, metaPosts=0;
  await page.route("**/api/listings/photo-review",async route=>{
    if(route.request().method()==="POST")metaPosts++;
    return route.fulfill({json:{enabled:false}});
  });
  await page.route("**/api/listings/photo-empty-view",async route=>{
    if(route.request().method()==="POST")metaPosts++;
    return route.fulfill({json:{enabled:false}});
  });
  await page.route("**/api/listings",async route=>{
    if(route.request().method()!=="POST")return route.continue();
    listingPosts++;
    return route.fulfill({status:201,json:{id:"mock-new-listing"}});
  });
  await page.route("**/api/listings/mock-new-listing/gallery",async route=>{
    const body=route.request().postDataJSON();
    expect(route.request().method()).toBe("POST");
    expect(body.consentToPublish).toBe(true);
    expect(body.checkedPersonalInfo).toBe(true);
    expect(body.aiGenerated).toBe(false);
    expect(body.image).toMatch(/^data:image\/jpeg;base64,/);
    photoPosts++;
    return route.fulfill({status:201,json:{id:"mock-photo-1"}});
  });
  await reachPhotoStep(page);
  await page.locator('.photo-guide input[type="file"]').setInputFiles({
    name:"test-room.jpg",mimeType:"image/jpeg",buffer:await generatedImage(page,"image/jpeg"),
  });
  await expect(page.getByText("test-room.jpg")).toBeVisible();
  await page.locator("#moveIn").fill("협의 가능");
  await page.locator("#publisher").fill("가상 집주인");
  await page.getByRole("button",{name:/다음 단계/}).click();
  await page.getByRole("button",{name:"매물 등록하기"}).click();
  await expect(page.getByRole("heading",{name:"매물 등록을 마쳤어요."})).toBeVisible();
  await expect(page.getByText("test-room.jpg")).toBeVisible();
  const publication=page.getByRole("button",{name:"검토한 사진 공개하기"});
  await expect(publication).toBeDisabled();
  expect(photoPosts).toBe(0);
  await page.getByRole("checkbox",{name:/검토한 게시용 JPEG 사진 공개/}).check();
  await publication.click();
  await expect(page.getByRole("button",{name:/게시 완료/})).toBeVisible();
  expect(listingPosts).toBe(1);
  expect(photoPosts).toBe(1);
  expect(metaPosts).toBe(0);
});


test("등록 후 사진 AI 옵션 선택을 실제 매물 수정 API로 저장한다",async({page})=>{
  let modelCalls=0,patchCalls=0;
  await page.route("**/api/listings/photo-review",async route=>{
    if(route.request().method()==="GET")return route.fulfill({json:{enabled:true,provider:"meta",maxImagesPerHour:3}});
    modelCalls++;
    return route.fulfill({json:{review:{room:"living_room",features:["에어컨","냉장고"],privacyFlags:[]}}});
  });
  await page.route("**/api/listings/photo-empty-view",async route=>route.fulfill({json:{enabled:false}}));
  await page.route("**/api/listings",async route=>{
    if(route.request().method()==="POST")return route.fulfill({status:201,json:{id:"mock-option-listing"}});
    return route.continue();
  });
  await page.route("**/api/listings/mock-option-listing",async route=>{
    expect(route.request().method()).toBe("PATCH");
    const body=route.request().postDataJSON();
    expect(body.options).toContain("냉장고");
    patchCalls++;
    return route.fulfill({status:200,json:{id:"mock-option-listing"}});
  });
  await reachPhotoStep(page);
  await page.locator('.photo-guide input[type="file"]').setInputFiles({
    name:"option-room.jpg",mimeType:"image/jpeg",buffer:await generatedImage(page,"image/jpeg"),
  });
  expect(modelCalls).toBe(0);
  await page.getByRole("checkbox",{name:/매물 정보 초안 추출/}).check();
  await page.getByRole("button",{name:"이 사진 AI 분석"}).click();
  await expect(page.getByRole("heading",{name:/AI가 사진 1장에서 찾아낸 내용/})).toBeVisible();
  await page.locator("#moveIn").fill("협의 가능");
  await page.locator("#publisher").fill("가상 집주인");
  await page.getByRole("button",{name:/다음 단계/}).click();
  await page.getByRole("button",{name:"매물 등록하기"}).click();
  await expect(page.getByRole("heading",{name:"매물 등록을 마쳤어요."})).toBeVisible();
  await page.locator(".photo-guide-option-chips .feature-chip").filter({hasText:"냉장고"}).click();
  await page.getByRole("button",{name:/선택한 1개를 실제 매물에 저장/}).click();
  await expect(page.getByText("선택한 옵션을 매물에 저장했어요.")).toBeVisible();
  expect(patchCalls).toBe(1);
  expect(modelCalls).toBe(1);
});
