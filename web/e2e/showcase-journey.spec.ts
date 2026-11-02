import {test,expect} from "@playwright/test";

test("P16 judges can follow owner/buyer/registry/neutral Jiptok journey without login",async({page})=>{
 const externalCalls:string[]=[];
 page.on("request",req=>{if(/api\/listings\/photo-review|api\/listings\/photo-empty-view|models\/|images\/edits/.test(req.url()))externalCalls.push(req.url());});
 await page.goto("/showcase");
 await expect(page.getByRole("heading",{name:/내 집을 올리는 순간부터/})).toBeVisible();
 await expect(page.getByRole("heading",{name:/4단계/})).toBeVisible();
 await expect(page.getByRole("heading",{name:"시연 A · 집을 찾는 입장"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"시연 B · 집주인 입장"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"시연 C · 권리분석"})).toBeVisible();
 await expect(page.getByRole("link",{name:/교육용 등기 PDF 분석/})).toHaveAttribute("href","/registry/extract");
 await expect(page.getByRole("link",{name:/매물 등록 시작/})).toHaveAttribute("href","/register");
 await expect(page.getByText(/전자계약 체결|공인 중개/).first()).toBeVisible();
 expect(externalCalls).toEqual([]);
});
test("P16 showcase is navigable from the shared site navigation",async({page})=>{
 await page.goto("/");
 await page.getByRole("navigation",{name:"주요 메뉴"}).getByRole("link",{name:"서비스 체험"}).click();
 await expect(page).toHaveURL(/\/showcase$/);
 await page.getByRole("link",{name:/등기 PDF 로컬 분석/}).click();
 await expect(page).toHaveURL(/\/registry\/extract$/);
});
