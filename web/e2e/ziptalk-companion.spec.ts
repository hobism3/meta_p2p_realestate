import { test, expect, type Page } from "@playwright/test";
import { mintTestToken } from "../lib/auth";

const SECRET = process.env.E2E_JWT_SECRET ?? "test-e2e-secret";
function loginAs(page: Page, sub: string, name: string) {
  const token = mintTestToken(sub, name, "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);
  return page.addInitScript((value: string) => localStorage.setItem("directhome.access_token", value), token);
}

test("집톡이: 채팅 밖에 등장하고 팝업에서 정리·합의 카드를 확인한다", async ({ page }) => {
  await loginAs(page, "companion-" + test.info().project.name, "팝업테스터");
  await page.goto("/listings/s21");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  await expect(page.getByRole("button", { name: "집톡이 열기" })).toBeVisible();
  await page.getByPlaceholder("메시지 입력").fill("44000만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  const popover = page.getByRole("region", { name: "집톡이의 조건 정리" });
  const peek = page.locator(".broker-peek");
  await expect(peek).toBeVisible({ timeout: 30000 });
  await expect(peek).toContainText(/어머|메모했어요|금액/);
  await expect(popover).toHaveCount(0);
  await peek.getByRole("button", { name: /제가 적은 거 볼래요/ }).click();
  await expect(popover).toBeVisible();
  await expect(popover.getByText(/새로 제안됐어요/).first()).toBeVisible();
  await expect(popover.locator(".broker-checkpoint")).toHaveCount(3);
  await expect(popover.getByText("다음엔 이거 하나만!", { exact: false })).toBeVisible();
  await expect(page.getByRole("log", { name: "거래 대화" }).getByText(/새로 제안됐어요/)).toHaveCount(0);
  await expect(page.getByRole("log", { name: "거래 대화" }).locator(".zipcard")).toHaveCount(0);
  await expect(page.locator(".conversation-row.is-mine").first()).toBeVisible();
  await page.locator(".ziptalk-close").click();
  await expect(popover).toHaveCount(0);
  await page.getByRole("button", { name: "집톡이 열기" }).click();
  await expect(popover.getByText(/새로 제안됐어요/).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "집톡이 열기" }).click();
  await expect(popover.getByText(/새로 제안됐어요/).first()).toBeVisible();
});

test("집톡이: 질문은 대화 입력칸에만 넣고, 전송하지 않는다", async ({ page }) => {
  await loginAs(page, "broker-action-" + test.info().project.name, "중개수첩테스터");
  await page.goto("/listings/s16");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  await page.getByRole("button", { name: "집톡이 열기" }).click();
  const popover = page.getByRole("region", { name: "집톡이의 조건 정리" });
  const chat = page.getByRole("log", { name: "거래 대화" });
  await expect(popover.getByText(/다음엔 이거 하나만/)).toBeVisible();
  const before = await chat.locator(".conversation-row.is-mine").count();
  await popover.getByRole("button", { name: /그 질문, 대화창에 넣어줘/ }).click();
  await expect(popover).toHaveCount(0);
  await expect(page.getByPlaceholder("메시지 입력")).toHaveValue(/방문 가능한 날짜|방문하는 일정|가격 조건|생활 조건/);
  await expect(chat.locator(".conversation-row.is-mine")).toHaveCount(before);
});

test("집톡이: 모바일 팝업에서 거래 현황으로 이동하고 가로로 넘치지 않는다", async ({ page }) => {
  await loginAs(page, "companion-mobile-" + test.info().project.name, "모바일테스터");
  await page.goto("/listings/s16");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  await page.getByRole("button", { name: "집톡이 열기" }).click();
  const popover = page.getByRole("region", { name: "집톡이의 조건 정리" });
  await expect(popover).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  await popover.locator(".ziptalk-popover-footer button").click();
  await expect(page.getByRole("heading", { name: "거래 현황" })).toBeVisible();
  await expect(popover).toHaveCount(0);
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
