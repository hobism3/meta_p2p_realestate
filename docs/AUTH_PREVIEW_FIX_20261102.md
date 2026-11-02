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
- **최종 코드 CI** (c0004157): [verify-fast #41384787316](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41384787316) SUCCESS (Next 빌드, unit/DAL **360/360 PASS**, API **214/214 PASS**); [verify-e2e #41384787355](https://github.com/hobism3/meta_p2p_realestate/actions/runs/41384787355) SUCCESS (**104 PASS / 4 SKIP**). 인증 복귀 3종 시나리오가 PC/모바일 각각 통과. 실제 Google OAuth 및 사용자 계정 로그인은 미검증.

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

## 병렬 PR 관리와 사용자 조치
- Draft PR #33에는 **사진 등록 분석/권리 분석 동작 로직 변경 없음**. 새 Preview 배포는 Vercel 100회/일 무료 배포 한도로 진행 불가. 코드 검증은 성공했지만 실접속 수동 검증은 BLOCKED.
- Google 로그인까지 Preview에서 직접 사용하려면 Supabase Authentication → URL Configuration → Redirect URLs에 테스트할 Preview URL의 정확한 `/auth/callback` 주소 허용이 필요. 새로운 PR의 `?next=%2Fregister` 쿼리가 붙는 Callback도 허용목록에 포함돼야 함.
- Supabase 공개 권장 `https://*-<team-slug>.vercel.app/**` 는 많은 Preview 도메인에 인증 토큰을 전달할 수 있으므로, 제한된 실험에서는 도메인 단위 최소 범위 허용을 선호함.
- Meta 잔여 크레딧 15달러. 현재 검증 세션에서 유료 호출 0회. 사용자 계정으로 브라우저에서 1회만 실행하는 것이 비용을 통제하며, API 게이트의 인스턴스별 quota는 전역 상한이 아님.


## 2026-11-02 15:00 KST · Supabase 커넥터 신규 연결 확인
- ChatGPT Supabase 연결 정상, 프로젝트 `DirectHome` ref `vnaedrgwilaeujlfravc` / 상태 `ACTIVE_HEALTHY` 확인. DB·사용자·JWT 원문은 출력하지 않음.
- 공식 가이드 [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) 및 2026-10-13 [잘못된 리다이렉트 FAQ](https://supabase.com/kb/troubleshooting/why-am-i-being-redirected-to-the-wrong-url-when-using-auth-redirectto-option-_vqIeO) 대조. `redirect_to`는 허용목록에 일치해야 하며, 일치하지 않을 때 기본 Site URL이 사용될 수 있음.
- 본 플러그인이 제공하는 Supabase API 기능 목록에는 **Auth URL Configuration 조회/변경 액션이 없음**. 연결 권한이 있어도 해당 설정을 자동으로 수정하지 못했으며 미변경이다.
- 확인할 Dashboard 경로: `https://supabase.com/dashboard/project/vnaedrgwilaeujlfravc/auth/url-configuration`.
- 기존 Preview 주소 기준 허용 항목 후보: `https://meta-p2p-realestate-oz2igfgvf-direct-home1.vercel.app/auth/callback`. 최신 PR #33이 배포되면 배포된 정확한 호스트에 맞는 `/auth/callback?next=%2Fregister`를 추가해야 한다. 정확한 호스트가 정해지기 전에는 광범위 와일드카드보다 최소 허용목록을 사용한다.
- **중요:** 현재 Preview는 PR #33 이전 코드이므로, 허용 URL만 추가해도 Google callback의 `window.location.replace('/')` 문제는 해결되지 않는다. 실제 개선은 PR #33 새 Preview 빌드 및 Supabase 허용목록 둘 다 필요하다.
- OAuth 서버 인증 기록을 집계로만 살펴봤으며 (개별 사용자·토큰 불조회), 로그인 성공/Preview 우회 여부를 입증할 만큼의 증거는 없었다. 따라서 실 Google 로그인 PASS 선언 금지.
- Meta 실호출은 여전히 **0회**. Supabase 커넥터만으로 외부 사진 분석 API를 POST 호출하는 능력이 생기는 것은 아니다.
