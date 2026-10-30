import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { mintTestToken } from "../lib/auth";

const PUBLIC_PDF_URL = "https://dangdang.io/blog/registry-samples/normal.pdf";
const EXPECTED_SHA = "2ddff3f07aa134c04456685db796ffb8029e007159eabc3c07c6c0fad1e87b50";
const E2E_SECRET = process.env.E2E_JWT_SECRET ?? "test-e2e-secret";

async function getExactPublicSample(page: Page): Promise<Buffer> {
  const res = await page.request.get(PUBLIC_PDF_URL, { timeout: 20000 });
  expect(res.status(), "Public educational PDF must download").toBe(200);
  const bytes = await res.body();
  expect(bytes.length).toBe(908854);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA);
  return bytes;
}

// One-off acceptance against the user's actual educational normal.pdf bytes;
// enabled on PR #4 only. All other PRs and main skip this *external-network*
// check so their CI stays deterministic. Never commit/store the PDF itself.
test.describe("Public Korean registry acceptance (real PDF bytes, offline Mock)", () => {
  test.skip(process.env.REGISTRY_PUBLIC_SAMPLE_E2E !== "1", "Only enabled for PR #4 acceptance");

  test("authenticated API upload: rejects unauthorized/undisclosed, extracts only expected fields", async ({ page }) => {
    const pdf = await getExactPublicSample(page);
    const payload = { filename: "normal.pdf", pdf_base64: pdf.toString("base64"), consent: true };
    const unauthorized = await page.request.post("/api/listings/import-registry", { data: payload });
    expect(unauthorized.status()).toBe(401);

    const token = mintTestToken(
      "registry-normal-api-" + test.info().project.name,
      "SyntheticNormalTest",
      "tenant",
      E2E_SECRET,
      Math.floor(Date.now() / 1000) + 3600,
    );
    const headers = { Authorization: `Bearer ${token}` };
    const noConsent = await page.request.post("/api/listings/import-registry", {
      data: { ...payload, consent: false },
      headers,
    });
    expect(noConsent.status()).toBe(400);

    const response = await page.request.post("/api/listings/import-registry", {
      data: payload,
      headers,
      timeout: 25000,
    });
    const json = await response.json();
    expect(response.status(), JSON.stringify(json)).toBe(200);
    expect(json.provider).toBe("mock");
    expect(json.model).toBe("synthetic-fixture");
    expect(json.draft).toMatchObject({
      documentKind: "registry",
      address: { value: "서울특별시 가상구 샘플로 10길 101" },
      exclusiveAreaSqm: { value: "59.84" },
      buildingName: { value: "당당아파트" },
      buildingDong: { value: "105" },
      floor: { value: "5" },
      unit: { value: "501" },
    });
    expect(json.draft).not.toHaveProperty("salePrice");
    expect(json.draft.cautions.join(" ")).toContain("Meta AI 추출 결과가 아닙니다");

    // A modified unknown PDF must never get the same pre-seeded Mock answer.
    const unknown = Buffer.from(pdf);
    unknown[200] ^= 0x01;
    const unknownRes = await page.request.post("/api/listings/import-registry", {
      data: { ...payload, pdf_base64: unknown.toString("base64") },
      headers,
    });
    expect(unknownRes.status()).toBe(422);
  });

  test("actual PDF upload in registration UI: preview, explicit consent, human apply", async ({ page }) => {
    const pdf = await getExactPublicSample(page);
    const token = mintTestToken(
      "registry-normal-ui-" + test.info().project.name,
      "SyntheticNormalUI",
      "tenant",
      E2E_SECRET,
      Math.floor(Date.now() / 1000) + 3600,
    );
    await page.addInitScript((t: string) => {
      window.localStorage.setItem("directhome.access_token", t);
    }, token);
    await page.goto("/register");
    await expect(page.getByText(/오프라인 Mock 시연/)).toBeVisible();
    await page.locator("#registry-pdf").setInputFiles({
      name: "normal.pdf", mimeType: "application/pdf", buffer: pdf,
    });
    const analyze = page.getByRole("button", { name: "AI로 매물 정보 추출하기" });
    await expect(analyze).toBeDisabled();
    await page.getByRole("checkbox").check();
    await analyze.click();
    await expect(page.getByText("가상 샘플 Mock")).toBeVisible();
    await expect(page.getByText("당당아파트", { exact: true })).toBeVisible();
    await expect(page.getByText("59.84", { exact: true })).toBeVisible();
    await expect(page.getByText("105", { exact: true })).toBeVisible();
    await expect(page.getByText("5", { exact: true })).toBeVisible();
    await expect(page.getByText("501", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "비어 있는 등록 항목에 반영하기" }).click();
    await expect(page.locator("#address")).toHaveValue("서울특별시 가상구 샘플로 10길 101");
    await expect(page.locator("#area")).toHaveValue("59.84");
    await expect(page.locator("#rent")).toHaveValue("");
    await expect(page.locator("#deposit")).toHaveValue("");
    await expect(page.getByText(/적용해도 매물은 게시되지 않습니다/)).toBeVisible();
  });
});
