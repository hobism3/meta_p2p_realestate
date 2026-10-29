import { expect, test, type Page } from "@playwright/test";
import { mintTestToken } from "../lib/auth";

// 브라우저 E2E는 인증 테스트 사용자(Bearer) 기반이다.
// 서버는 SUPABASE_JWT_SECRET=test-e2e-secret으로 뜬다.
const E2E_SECRET = process.env.E2E_JWT_SECRET ?? "test-e2e-secret";

// desktop·mobile이 같은 DB를 공유하므로 사용자ID에 프로젝트를 붙여 방을 분리한다.
function uid(base: string): string {
  return `${base}-${test.info().project.name}`;
}

async function loginAs(page: Page, sub: string, name: string, role = "tenant"): Promise<void> {
  const token = mintTestToken(sub, name, role, E2E_SECRET, Math.floor(Date.now() / 1000) + 3600);
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("directhome.access_token", t);
  }, token);
}

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

test("상세: 정보와 문의 버튼이 있다", async ({ page }) => {
  await page.goto("/listings/s01");
  await expect(page.getByRole("heading", { name: /신림역 도보 5분/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "문의하기" })).toBeVisible();
});

test("등록: 폼 제출 후 상세가 열린다", async ({ page }) => {
  await loginAs(page, "e2e-owner", "E2E등록자");
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

test("시연방: 문의→AI 첫인사→대화→새로고침 유지", async ({ page }) => {
  await loginAs(page, uid("e2e-buyer"), "E2E매수자");
  await page.goto("/listings/s21");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  await expect(page.getByText("AI 매도자").first()).toBeVisible();
  await page.getByPlaceholder("메시지 입력").fill("매매가 얼마인가요?");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText("가격은").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("가격은").first()).toBeVisible();
});

test("시연방: 집톡이 제안 정리→거래 현황", async ({ page }) => {
  await loginAs(page, uid("e2e-ziptalk"), "E2E집톡이");
  await page.goto("/listings/s21");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  await page.getByPlaceholder("메시지 입력").fill("44000만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText("새로 제안됐어요").first()).toBeVisible();
  await expect(page.getByText("집톡이").first()).toBeVisible();
  await page.getByRole("button", { name: "거래 현황", exact: true }).click();
  await expect(page.getByText("44,000만원").first()).toBeVisible();
  await expect(page.getByText("제안은 양측이 모두 동의해야 확정됩니다.")).toBeVisible();
  await expect(page.getByText("45,000만원").first()).toBeVisible();
  const wishRow = page.locator("li", { hasText: "매수 희망가" }).first();
  await wishRow.getByRole("button", { name: "동의하기" }).click();
  await expect(wishRow).toContainText("양측 동의");
  await page.getByRole("button", { name: "거래 현황 닫기" }).click();
  await page.getByPlaceholder("메시지 입력").fill("44500만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  await page.getByRole("button", { name: "거래 현황", exact: true }).click();
  await expect(wishRow).toContainText("동의 대기");
  await wishRow.getByRole("button", { name: "동의하기" }).click();
  await expect(wishRow).toContainText("양측 동의");
  await page.getByRole("button", { name: "거래 현황 닫기" }).click();
  await page.getByPlaceholder("메시지 입력").fill("매매가 얼마인가요?");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText("매수 희망가는 44,500만원").first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "거래 현황", exact: true }).click();
  await expect(page.getByText("44,000만원").first()).toBeVisible();
});

test("시연방: 방문 제안→일정 확인→변경", async ({ page }) => {
  await loginAs(page, uid("e2e-visit"), "E2E방문");
  await page.goto("/listings/s24");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  await page.getByPlaceholder("메시지 입력").fill("38000만원에 합시다");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText("새로 제안됐어요").first()).toBeVisible();
  await page.getByPlaceholder("메시지 입력").fill("내일 오후 2시에 방문하고 싶어요");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText("거래 현황에서 확인해 주세요").first()).toBeVisible();
  await page.getByRole("button", { name: "거래 현황", exact: true }).click();
  await page.getByRole("button", { name: "일정 확인" }).click();
  await expect(page.getByText("수락됨").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "일정 확인" })).toHaveCount(0);
  await page.getByRole("button", { name: "거래 현황 닫기" }).click();
  await page.getByPlaceholder("메시지 입력").fill("모레 오후 2시로 바꿔서 방문하고 싶어요");
  await page.getByRole("button", { name: "전송" }).click();
  await page.getByRole("button", { name: "거래 현황", exact: true }).click();
  await expect(page.getByRole("button", { name: "일정 확인" })).toHaveCount(1);
});

test("문의: 같은 매물은 기존 방으로 재입장", async ({ page }) => {
  await loginAs(page, uid("e2e-reentry"), "E2E재입장");
  await page.goto("/listings/s21");
  if (await page.getByRole("button", { name: "문의하기" }).count() > 0) {
    await page.getByRole("button", { name: "문의하기" }).click();
    await expect(page).toHaveURL(/\/rooms\//);
    await page.goto("/listings/s21");
  }
  await page.getByRole("link", { name: "대화 이어하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  const u1 = page.url();
  await page.goto("/listings/s21");
  await page.getByRole("link", { name: "대화 이어하기" }).click();
  await expect(page).toHaveURL(u1);
});

test("실거래방: AI가 끼지 않는다", async ({ browser }) => {
  const octx = await browser.newContext();
  const opage = await octx.newPage();
  await loginAs(opage, "e2e-ownerx", "E2E소유X");
  await opage.goto("/register");
  await opage.getByPlaceholder("예: 신림역 도보 5분 원룸").fill("E2E 실거래집");
  await opage.getByPlaceholder("예: 서울 관악구 신림로 100 (가상)").fill("서울 관악구 E2E로 1 (가상)");
  await opage.getByPlaceholder("예: 1000").fill("500");
  await opage.getByPlaceholder("예: 65").fill("50");
  await opage.getByPlaceholder("예: 23").fill("21");
  await opage.getByPlaceholder(/즉시 입주/).fill("2026-12-01");
  await opage.getByPlaceholder("예: 홍길동").fill("E2E");
  await opage.getByRole("button", { name: "등록하기" }).click();
  const href = await opage.getByRole("link", { name: "상세 보기" }).getAttribute("href");
  const bctx = await browser.newContext();
  const bpage = await bctx.newPage();
  await loginAs(bpage, "e2e-buyerx", "E2E구매X");
  await bpage.goto(href ?? "/");
  await bpage.getByRole("button", { name: "문의하기" }).click();
  await expect(bpage).toHaveURL(/\/rooms\//);
  await bpage.getByPlaceholder("메시지 입력").fill("실거래 문의입니다");
  await bpage.getByRole("button", { name: "전송" }).click();
  await expect(bpage.getByText("실거래 문의입니다")).toBeVisible();
  await expect(bpage.locator(".bubble.mine")).toBeVisible();
  await expect(bpage.locator(".zipcard")).toHaveCount(0);
  await expect(bpage.getByText("(AI)")).toHaveCount(0);
  await octx.close();
  await bctx.close();
});

test("모바일: 가로 넘침이 없다", async ({ page }) => {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("지도: 마커 클릭 시 매물과 연동된다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "지도형" }).click();
  const marker = page.locator(".leaflet-marker-icon").first();
  await expect(marker).toBeVisible({ timeout: 20000 });
  // Leaflet 마커는 포인터를 가로채서 일반 클릭이 막힌다. DOM 클릭을 직접 보낸다.
  await marker.dispatchEvent("click");
  await expect(page.locator(".leaflet-tooltip").first()).toBeVisible();
});

test("지도: 리스트 클릭 시 상세로 이동한다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "지도형" }).click();
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible({ timeout: 20000 });
  await page.locator(".side .listing").first().click();
  await expect(page).toHaveURL(/\/listings\//);
});

test("방: 문의→생성→채팅→새로고침 유지, 타인은 차단된다", async ({ page, context }) => {
  const tag = `ROOM${Date.now()}`;
  await loginAs(page, uid("e2e-buyer"), "E2E매수자");
  await page.goto("/listings/s02");
  await page.getByRole("button", { name: "문의하기" }).click();
  await expect(page).toHaveURL(/\/rooms\//);
  const roomUrl = page.url();
  await page.getByPlaceholder("메시지 입력").fill(`${tag} 방 문의`);
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText(`${tag} 방 문의`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${tag} 방 문의`)).toBeVisible();
  const other = await context.newPage();
  await loginAs(other, uid("e2e-stranger"), "E2E타인");
  await other.goto(roomUrl);
  await expect(other.locator("p.error")).toContainText(/권한/);
});
