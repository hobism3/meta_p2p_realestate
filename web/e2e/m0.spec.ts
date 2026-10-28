import { expect, test } from "@playwright/test";

test("메인: 매물 목록이 보인다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /관악구 신림동/ })).toBeVisible();
  await expect(page.locator(".listing").first()).toBeVisible();
});

test("메인: 검색 필터가 좁혀진다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".listing").first()).toBeVisible();
  const before = await page.locator(".listing").count();
  await page.getByPlaceholder(/지역·주소·키워드/).fill("투룸");
  await expect.poll(async () => page.locator(".listing").count()).toBeLessThan(before);
});

test("메인: 지도형 전환 시 지도가 보인다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "지도형" }).click();
  await expect(page.locator(".mapbox").first()).toBeVisible();
});

test("상세: 정보와 거래방 링크가 있다", async ({ page }) => {
  await page.goto("/listings/s01");
  await expect(page.getByRole("heading", { name: /신림역 도보 5분/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "거래방 열기" })).toBeVisible();
});

test("등록: 폼 제출 후 상세가 열린다", async ({ page }) => {
  await page.goto("/register");
  await page.getByPlaceholder("예: 신림역 도보 5분 원룸").fill("E2E 테스트방");
  await page.getByPlaceholder("예: 서울 관악구 신림로 100 (가상)").fill("서울 관악구 E2E로 1 (가상)");
  await page.getByPlaceholder("예: 1000").fill("500");
  await page.getByPlaceholder("예: 65").fill("50");
  await page.getByPlaceholder("예: 23").fill("21");
  await page.getByPlaceholder(/즉시 입주/).fill("2026-12-01");
  await page.getByPlaceholder("예: 홍길동").fill("E2E");
  await page.getByRole("button", { name: "등록하기" }).click();
  await expect(page.getByRole("link", { name: "상세 보기" })).toBeVisible();
});

test("거래방: 역할·메시지·일정·합의·체크가 된다", async ({ page }) => {
  const tag = `E2E${Date.now()}`;
  await page.goto("/deal/s02");
  await page.getByRole("combobox").first().selectOption("tenant");
  await page.getByPlaceholder("이름(별명)").fill("E2E세입자");
  await page.getByPlaceholder("메시지 입력").fill(`${tag} 문의합니다`);
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText(`${tag} 문의합니다`)).toBeVisible();
  await page.getByPlaceholder("예: 보증금 1000만원, 월세 65만원, 11월 10일 입주").fill(`${tag} 합의`);
  await page.getByRole("button", { name: "기록" }).click();
  await expect(page.getByText(`${tag} 합의`)).toBeVisible();
  await page.getByText("신분 확인").check();
  await expect(page.getByText("신분 확인")).toBeChecked();
});

test("모바일: 가로 넘침이 없다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".listing").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
