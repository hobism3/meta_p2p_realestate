import { test, expect } from "@playwright/test";

test("등록 중 로그인은 Preview 안의 등록 화면으로 복귀한다", async ({page}) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({access_token:"synthetic-only-test-access-token",expires_in:3600}),
  }));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({userId:"synthetic-owner",name:"테스트 사용자",mode:"supabase"}),
  }));
  await page.goto("/register");
  const login = page.getByRole("link", {name:"로그인",exact:true});
  await expect(login).toHaveAttribute("href", "/login?next=%2Fregister");
  await login.click();
  await expect(page).toHaveURL(/\/login\?next=%2Fregister$/);
  await page.getByLabel("이메일").fill("test.owner@example.invalid");
  await page.getByLabel("비밀번호", {exact:true}).fill("SyntheticPassword123");
  await page.getByRole("button", {name:"로그인",exact:true}).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", {name:/집을 소개하는/})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("directhome.access_token")))
    .toBe("synthetic-only-test-access-token");
});

test("Google 로그인은 next를 보존하고 OAuth 콜백도 등록 화면으로 복귀한다", async ({page}) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({userId:"synthetic-google",name:"합성 테스트",mode:"supabase"}),
  }));
  await page.goto("/login?next=%2Fregister");
  await expect(page.getByRole("link", {name:/Google로 계속하기/}))
    .toHaveAttribute("href","/api/auth/oauth?provider=google&next=%2Fregister");
  await page.goto("/auth/callback?next=%2Fregister#access_token=synthetic-google-token&token_type=bearer");
  await expect(page).toHaveURL(/\/register$/);
  expect(await page.evaluate(() => localStorage.getItem("directhome.access_token")))
    .toBe("synthetic-google-token");
});

test("외부 redirect 쿼리는 /로 제한한다", async ({page}) => {
  await page.goto("/auth/callback?next=%2F%2Fevil.invalid#access_token=synthetic-jwt");
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/evil\.invalid/);
});
