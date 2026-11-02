import {expect,test} from "@playwright/test";

test("P10: bundled local PDF worker extracts a fictional PDF without POST or external model",async({page})=>{
 const res=await page.request.get("/api/listings/import-registry/sample");
 expect(res.status()).toBe(200);
 const pdf=await res.body();
 expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
 const outbound:{method:string;url:string}[]=[];
 page.on("request",r=>outbound.push({method:r.method(),url:r.url()}));
 await page.goto("/registry/extract");
 await page.getByLabel("로컬 PDF 파일 선택").setInputFiles({
  name:"synthetic-textlayer.pdf",mimeType:"application/pdf",buffer:pdf,
 });
 await expect(page.locator("#registry-pasted-text")).toHaveValue(/DIRECTHOME - FICTIONAL PROPERTY RECORD/, {timeout:30000});
 await expect(page.getByText("추출 규모:",{exact:true}).locator("..")).toContainText("1페이지");
 await expect(page.getByText(/PDF 텍스트는 추출했지만 갑구·을구 구조를 확인하지 못했습니다/)).toBeVisible();
 // Reading English demonstration material is not evidence of Korean title rights.
 await expect(page.getByText(/후보 0건 검토/)).toBeVisible();
 expect(outbound.filter(r=>r.method==="POST"&&/api\/listings\/import-registry|api\/listings\/photo-review/.test(r.url))).toEqual([]);
 expect(outbound.filter(r=>r.url.startsWith("https://")&&!r.url.includes("127.0.0.1")&&!r.url.includes("localhost"))).toEqual([]);
});

test("P10: a selected Korean synthetic text row still requires per-item human approval",async({page})=>{
 await page.goto("/registry/extract");
 await page.getByLabel("가상 복사 텍스트 실험").selectOption("P9-T02");
 await page.getByRole("button",{name:"직접 수정한 텍스트로 다시 분석하기"}).click();
 await expect(page.getByRole("heading",{name:/후보 1건 검토/})).toBeVisible();
 await expect(page.getByText(/채권최고액 후보:/)).toContainText("12,000만원");
 const transfer=page.getByRole("button",{name:/선택한 정형 값만 권리관계 점검으로 가져오기/});
 await expect(transfer).toBeDisabled();
 await page.getByRole("combobox",{name:/이 등기 항목의 효력을/}).selectOption("active");
 await page.getByRole("checkbox",{name:/원본과 대조했습니다/}).check();
 await expect(transfer).toBeEnabled();
 await transfer.click();
 await expect(page).toHaveURL(/\/registry\/check$/);
 await expect(page.getByText(/정형 권리 후보 1건을 불러왔습니다/)).toBeVisible();
 const stored=await page.evaluate(()=>window.sessionStorage.getItem("directhome.registry.verified-input-transfer.v1"));
 expect(stored).toBeNull();
});

test("P10: invalid PDF bytes never become rights evidence",async({page})=>{
 await page.goto("/registry/extract");
 await page.getByLabel("로컬 PDF 파일 선택").setInputFiles({
  name:"fake.pdf",mimeType:"application/pdf",buffer:Buffer.from("X".repeat(500)),
 });
 await expect(page.getByText(/PDF 로컬 텍스트 추출에 실패했습니다/)).toBeVisible();
 await expect(page.getByText(/후보 [0-9]+건 검토/)).toHaveCount(0);
});

test("P11: five externally published fictional registry PDFs are linked without fetching them automatically",async({page})=>{
 const outbound:string[]=[];
 page.on("request",r=>outbound.push(r.url()));
 await page.goto("/registry/extract");
 await expect(page.getByRole("heading",{name:/공개 교육용 가상 등기부 PDF 5종/})).toBeVisible();
 const pdfLinks=page.locator('a[href^="https://dangdang.io/blog/registry-samples/"]');
 await expect(pdfLinks).toHaveCount(5);
 const hrefs=await pdfLinks.evaluateAll(anchors=>anchors.map(a=>(a as HTMLAnchorElement).href));
 expect(new Set(hrefs).size).toBe(5);
 for(const link of hrefs)expect(link.endsWith(".pdf")).toBe(true);
 expect(outbound.filter(url=>url.includes("registry-samples/"))).toEqual([]);
 await expect(page.getByText(/실제 부동산 등기사항증명서가 아닙니다/)).toBeVisible();
});

test("P12: HUG publisher table facts are shown as unapproved rights with independent row coverage",async({page})=>{
 const publicEducationalText=[
  "[PAGE 1]","【갑 구】",
  "3 | 압류 | 2022년1월13일",
  "【을 구】",
  "1 | 근저당권설정 | 2018년8월6일 | 채권최고액 금2,000,000,000원",
 ].join("\n");
 await page.goto("/registry/extract");
 await page.locator("#registry-pasted-text").fill(publicEducationalText);
 await page.getByRole("button",{name:"직접 수정한 텍스트로 다시 분석하기"}).click();
 await expect(page.getByRole("heading",{name:/후보 2건 검토/})).toBeVisible();
 await expect(page.locator('[role="note"]').filter({hasText:"눈에 보이는 번호 권리행 2건"})).toBeVisible();
 await expect(page.getByText(/채권최고액 후보:/)).toContainText("200,000만원");
 await expect(page.getByRole("button",{name:/선택한 정형 값만 권리관계 점검으로 가져오기/})).toBeDisabled();
 await expect(page.getByText(/두 탐색 결과가 일치해도/)).toBeVisible();
});
