import { readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localBrowsers = join(process.cwd(), ".playwright-browsers");
// 브라우저 경로 고정: 실행기 기본 경로에 빌드가 없으면 전패하므로
// 프로젝트 내 벤더링 경로를 우선 사용한다.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  try {
    if (readdirSync(localBrowsers).some((f) => f.startsWith("chromium"))) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
    }
  } catch { /* 벤더링 없음: 기본 경로 사용 */ }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // workers: 1 — 단일 webServer + 공유 e2e.db이므로 직렬 실행이 격리 조건이다.
  workers: 1,
  // per-test timeout과 webServer 기동 timeout(아래 120000)은 분리한다.
  // globalTimeout은 두지 않는다: 테스트가 전역 예산을 다 쓰면 teardown이
  // 잘려 종료코드 1이 되는 레이스가 발생한다.
  timeout: 60000,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_BASE ?? "http://127.0.0.1:3130",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE
    ? undefined
    : {
        command: "node node_modules/next/dist/bin/next start -p 3130",
        url: "http://127.0.0.1:3130/api/health",
        reuseExistingServer: true,
        timeout: 120000,
        env: {
          DB_PATH: "./data/e2e.db",
          WRITE_TOKEN: "test-token",
          RATE_LIMIT_PER_MIN: "1000",
        },
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
