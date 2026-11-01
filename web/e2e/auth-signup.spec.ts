import {test,expect} from "@playwright/test";

test("이메일 회원가입은 구글 로그인과 함께 제공되며 인증 메일을 안내한다",async({page})=>{
  let posted:Record<string,unknown>|null=null;
  await page.route("**/api/auth/signup",async route=>{
    posted=route.request().postDataJSON();
    await route.fulfill({status:201,contentType:"application/json",
      body:JSON.stringify({requiresConfirmation:true,message:"인증 메일이 발송됐습니다. 확인해 주세요."})});
  });
  await page.goto("/login");
  await expect(page.getByRole("link",{name:/Google로 계속하기/})).toBeVisible();
  await page.getByRole("tab",{name:"회원가입"}).click();
  await page.getByLabel("이름").fill("집주인 테스터");
  await page.getByLabel("이메일").fill("owner@example.test");
  await page.getByLabel("비밀번호",{exact:true}).fill("SecureOwner2026");
  await page.getByLabel("비밀번호 확인").fill("SecureOwner2026");
  await page.getByRole("button",{name:"회원가입",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("인증 메일이 발송");
  await expect(page.getByRole("tab",{name:"로그인"})).toHaveAttribute("aria-selected","true");
  expect(posted).toMatchObject({name:"집주인 테스터",email:"owner@example.test",password:"SecureOwner2026"});
});
test("비밀번호 불일치와 약한 비밀번호는 요청 전에 차단된다",async({page})=>{
  let requests=0;
  await page.route("**/api/auth/signup",async route=>{requests++;await route.fulfill({status:201,body:"{}"});});
  await page.goto("/login");
  await page.getByRole("tab",{name:"회원가입"}).click();
  await page.getByLabel("이름").fill("두 번째 테스트");
  await page.getByLabel("이메일").fill("visitor@example.test");
  await page.getByLabel("비밀번호",{exact:true}).fill("weakpassword");
  await page.getByLabel("비밀번호 확인").fill("weakpassword");
  await page.getByRole("button",{name:"회원가입",exact:true}).click();
  await expect(page.locator(".auth-box .error")).toContainText("영문과 숫자");
  await page.getByLabel("비밀번호",{exact:true}).fill("StrongVisitor2026");
  await page.getByLabel("비밀번호 확인").fill("AnotherPassword2026");
  await page.getByRole("button",{name:"회원가입",exact:true}).click();
  await expect(page.locator(".auth-box .error")).toContainText("일치하지 않습니다");
  expect(requests).toBe(0);
});
test("비밀번호 찾기에는 계정 유무를 노출하지 않는 안내가 표시된다",async({page})=>{
  await page.route("**/api/auth/recover",route=>route.fulfill({status:200,contentType:"application/json",
   body:JSON.stringify({message:"가입된 이메일이라면 비밀번호 재설정 메일이 발송됩니다."})}));
  await page.goto("/login");
  await page.getByRole("button",{name:"비밀번호를 잊으셨나요?"}).click();
  await page.getByLabel("이메일").fill("visitor@example.test");
  await page.getByRole("button",{name:"재설정 메일 보내기"}).click();
  await expect(page.getByRole("status")).toContainText("가입된 이메일이라면");
});

test("상단 회원가입 메뉴로 직접 가입 화면을 연다",async({page})=>{
  await page.goto("/");
  await page.getByRole("link",{name:"회원가입",exact:true}).click();
  await expect(page).toHaveURL(/\/login\?mode=signup$/);
  await expect(page.getByRole("heading",{name:"이메일로 회원가입"})).toBeVisible();
});
