import { expect, test } from "@playwright/test";

test("매물 등록 마법사: 필수값, 진행, 가격 전환, 검토가 동작한다", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: /집을 소개하는 일이/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /매물 등록하기/ })).toHaveCount(0);

  await page.getByRole("button", { name: /직접 입력해서 시작/ }).click();
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.locator(".wizard-error")).toContainText("매물 제목");

  await page.locator("#title").fill("가상 신림 투룸");
  await page.locator("#address").fill("서울 관악구 가상로 100");
  await page.locator("#area").fill("59.84");
  await expect(page.locator(".wizard-preview h3")).toContainText("가상 신림 투룸");
  await page.getByRole("button", { name: /다음 단계/ }).click();

  await page.getByRole("button", { name: /매매 주택/ }).click();
  await expect(page.locator("#salePrice")).toBeVisible();
  await expect(page.locator("#rent")).toHaveCount(0);
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.locator(".wizard-error")).toContainText("매매가");

  await page.locator("#salePrice").fill("85000");
  await expect(page.locator(".wizard-preview-price")).toContainText("85,000");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.locator("#moveIn").fill("협의 가능");
  await page.locator("#publisher").fill("시연");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("heading", { name: /등록 전에 한 번만/ })).toBeVisible();
  await expect(page.locator(".wizard-review").getByText("매매 85,000만")).toBeVisible();
  await expect(page.getByRole("button", { name: /매물 등록하기/ })).toBeVisible();
});

test("매물 등록 마법사: 현재 탭에서 새로고침해도 입력과 단계가 유지된다", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: /직접 입력해서 시작/ }).click();
  await page.locator("#title").fill("임시 저장 매물");
  await page.locator("#address").fill("서울 가상로 5");
  await page.locator("#area").fill("33");
  await page.reload();
  await expect(page.locator("#title")).toHaveValue("임시 저장 매물");
  await expect(page.locator("#address")).toHaveValue("서울 가상로 5");
  await expect(page.locator("#area")).toHaveValue("33");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("button", { name: /전세 보증금/ })).toBeVisible();
});
