import { test, expect, type Page } from "@playwright/test";
import { mintTestToken } from "../lib/auth";

const SECRET = process.env.E2E_JWT_SECRET ?? "test-e2e-secret";
function loginAs(page: Page, sub: string, name: string) {
  const token = mintTestToken(sub, name, "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);
  return page.addInitScript((value: string) => localStorage.setItem("directhome.access_token", value), token);
}

test("집톡이: 상담창 대신 그룹채팅에서 말하고 합의 카드를 보여준다", async ({ page }) => {
  await loginAs(page, "companion-" + test.info().project.name, "그룹채팅테스터");
  await page.goto("/listings/s21");
  await page.getByRole("button", { name: "문의하기" }).click();
  const chat = page.getByRole("log", { name: "거래 대화" });
  await expect(chat.locator(".jiptok-checkpoint")).toHaveCount(3);
  await expect(page.locator(".ziptalk-companion")).toHaveCount(0);
  await page.getByPlaceholder("메시지 입력").fill("44000만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(chat.locator(".conversation-row.is-jiptok").last()).toBeVisible({ timeout: 30000 });
  await expect(chat.locator(".proposal-card").last()).toBeVisible();
  await expect(chat.locator(".jiptok-checkpoint").first()).toContainText("동의 대기");
  await page.reload();
  await expect(page.getByRole("log", { name: "거래 대화" }).locator(".conversation-row.is-jiptok").last()).toBeVisible();
});

test("집톡이: 가격 카드에 동의하면 양측 확인이 표시되고, 수정하면 다시 대기한다", async ({ page }) => {
  await loginAs(page, "approval-" + test.info().project.name, "동의테스터");
  await page.goto("/listings/s21");
  await page.getByRole("button", { name: "문의하기" }).click();
  const chat = page.getByRole("log", { name: "거래 대화" });
  await page.getByPlaceholder("메시지 입력").fill("44000만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  const card = chat.locator(".proposal-card").last();
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.getByRole("button", { name: "동의하기" }).click();
  await expect(chat.locator(".jiptok-checkpoint").first()).toContainText("양측 확인");
  await page.getByPlaceholder("메시지 입력").fill("44500만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(chat.locator(".proposal-card").last()).toContainText("44,500");
  await expect(chat.locator(".jiptok-checkpoint").first()).toContainText("동의 대기");
});

test("집톡이: 모바일 화면에서 그룹채팅과 진행현황이 넘치지 않는다", async ({ page }) => {
  await loginAs(page, "companion-mobile-" + test.info().project.name, "모바일테스터");
  await page.goto("/listings/s16");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page.getByRole("log", { name: "거래 대화" }).locator(".jiptok-checkpoint")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "거래 현황", exact: true }).click();
  await expect(page.getByRole("heading", { name: "거래 현황" })).toBeVisible();
});

test("내 거래방: 검색 및 필터, 빈 상태를 제공한다", async ({ page }) => {
  await loginAs(page, "inbox-ui-" + test.info().project.name, "거래함테스터");
  await page.goto("/rooms");
  await expect(page.getByRole("heading", { name: /내 거래방/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "거래방 필터" })).toBeVisible();
  await page.getByRole("button", { name: /AI 시연/ }).click();
  await page.getByPlaceholder("매물 이름으로 검색").fill("없는 매물");
  await expect(page.getByText(/검색 조건에 맞는 거래방이 없어요|아직 시작한 대화가 없어요/)).toBeVisible();
});
