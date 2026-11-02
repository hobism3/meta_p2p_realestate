# Preview 로그인 복귀 버그 수정 · 2026-11-02

## 원인과 증거
- 기존 `web/app/login/page.tsx`의 목적지 기본값 `/`. 브라우저 상단 로그인 링크는 `next`를 전달하지 않음.
- 기존 `web/app/auth/callback/page.tsx`의 Google 로그인 성공 시 `window.location.replace("/")` 고정.
- OAuth 시작 `web/app/api/auth/oauth/route.ts`는 Supabase `redirect_to`에 현재 origin의 `/auth/callback`만 전달. 실제 Google Callback이 Preview allowlist에 없으면 Supabase 기본 Site URL로 돌아갈 수 있음.
- 이 때문에 Preview 등록 화면으로 복귀할 수 없거나, OAuth에서 Production 메인으로 이동할 수 있음.

## 수정
- 모든 헤더 로그인 링크는 보던 내부 경로를 URL 인코딩해 `next`로 전달(등록 페이지 `/register`).
- 이메일 로그인 성공 후 동일 Preview의 `next`로 이동. 이미 로그인한 상태에도 `이전 작업으로 돌아가기` 제공.
- Google OAuth에서 origin·내부 `next`를 `redirect_to`에 전달, Callback에서 안전한 내부 경로로 이동.
- `safeAuthDestination`은 외부 URL, `//` 상대 도메인, 인코딩/역슬래시/제어 문자 리다이렉트를 거절.
- 실제 계정/키/토큰을 저장하거나 로그에 남기지 않음. 사진 및 등기 분석 소스는 수정하지 않음.

## 자동 검증
- `web/tests/auth-return.test.mjs`: 내부 복귀/외부 도메인 우회 거부.
- `web/e2e/preview-login-return.spec.ts`: Mock 이메일 인증, OAuth Callback 모의 토큰, 등록 복귀, 악성 URL. 실제 인증 서비스 로그인 테스트 아님.
- `verify-fast`에 unit 테스트 추가. `verify-e2e`는 모든 Playwright 파일 실행.
- **최초 코드 SHA**: `c0004157716ada0ea13429e0cb5eb141d682fec4`.
- **CI 상태**: 본 문서 작성 당시 verify-fast SUCCESS, verify-e2e IN_PROGRESS. UI 수동 로그인/Google real OAuth 미검증.

## 외부 설정·배포 차단
- GitHub PR #33, 기준 main `bb4fe7a`. PR #25는 2026-11-02 03:40:35Z에 다른 작업에서 main에 병합되었음. 따라서 로그인 변경은 별도 PR #33에 격리. Production 배포/병합 안 함.
- Vercel 신규 Preview 배포 요청은 **402 `api-deployments-free-per-day`, 100회/일 할당량 소진, Retry-After 86400**으로 차단. 사용자 요금제·플랜 변경은 수행하지 않음.
- Supabase Google Redirect URL allowlist는 Dashboard > Authentication > URL Configuration 에서 Preview의 `https://<preview-host>/auth/callback?next=%2Fregister`(또는 운영을 고려한 제한된 패턴)을 허용해야 함. 이 프로젝트 Supabase 연결 권한이 없어 계정 설정 변경은 미실행. 넓은 Vercel 와일드카드는 토큰 전달 대상이 늘어나므로 검토 없이 사용하지 않음.
- **현재 작동 가능한 무배포 대안**: `https://meta-p2p-realestate-oz2igfgvf-direct-home1.vercel.app/login?next=%2Fregister`에서 이메일/비밀번호 로그인. 기존 코드 자체에 next 처리 로직이 있어 메인 경유 없이 같은 Preview 등록 화면으로 이동. GET 로그인·등록 페이지 200 확인. 실제 로그인은 아직 미실행.
- 현재 Preview Muse Spark `GET /api/listings/photo-review` = `enabled:true`, `maxImagesPerHour:1` 확인. 자동 재시도 없음. **실제 Meta API 과금 호출 0회**, API 정확도 미검증.
- 직접 Muse 실호출에 필요한 것은 보호된 로그인 세션이 있는 브라우저/POST 작업 권한. 현재 Vercel read/fetch 도구는 GET 전용이므로 본 세션에서 수행 불가. ChatGPT Work의 Cloud Browser에서 계정 연결/로그인이 이뤄져야 실제 UI 클릭 테스트 가능.

## 출시/병합 게이트
- CI 완료 확인.
- 실제 Google Login에 대한 Supabase Preview redirect allowlist 설정과 Preview 배포 할당량 확보.
- 향후 사진 유료 요청은 서버리스 인스턴스별 제한이 **전역 과금 상한은 아님**. 사진 분석 기능을 공개 환경에 계속 열기 전에 전역 비용 쿼터 또는 소유자 승인 게이트 필요.
