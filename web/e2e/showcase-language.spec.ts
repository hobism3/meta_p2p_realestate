import { test, expect } from "@playwright/test";

test("English demo can be opened directly, then switched to Korean and persisted", async ({page}) => {
  let modelCalls = 0;
  page.on("request", req => {if (/api\/listings\/photo-review|api\/listings\/photo-empty-view|models\//.test(req.url())) modelCalls++;});
  await page.goto("/showcase?lang=en");
  await expect(page.getByRole("heading",{name:/From listing a home/})).toBeVisible();
  await expect(page.getByRole("link",{name:"Start listing a home"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Explore homes"})).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang","en");
  await page.getByRole("button",{name:"한국어"}).click();
  await expect(page.getByRole("heading",{name:/내 집을 올리는 순간부터/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading",{name:/내 집을 올리는 순간부터/})).toBeVisible();
  expect(modelCalls).toBe(0);
});

test("global KR / EN navigation keeps locale and fits mobile", async ({page}) => {
  await page.goto("/showcase");
  await page.getByRole("group",{name:/Interface language/}).getByRole("button",{name:"EN"}).click();
  await expect(page.getByRole("heading",{name:/From listing a home/})).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang","en");
  await page.goto("/register");
  await expect(page.getByRole("link",{name:"List a home"})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
