# DirectHome 계정 및 테스트 계정 운영 — 2026-11-01

## 확인된 운영 환경
- 인증: Supabase Auth. Google OAuth와 이메일/비밀번호를 병행한다. 이메일/비밀번호 로그인 API는 기존 구현을 유지한다.
- 신규 이메일 회원가입: `POST /api/auth/signup` → Supabase `/auth/v1/signup`. 서버는 Supabase anon key만 사용하고 비밀번호/세션을 앱 DB에 직접 저장하지 않는다.
- 프로덕션 DB: /api/health 의 `{"db":"up","kind":"pg"}` 확인(2026-11-01). Vercel Production에는 DATABASE_URL이 등록되어 있고 코드는 PostgreSQL DAL을 선택한다. **Preview는 코드상 임시 SQLite이므로 배포 간 데이터가 유지되지 않는다.**
- 계정 유형은 소유권으로 결정된다. 가입 시 사용자 역할이나 별도 admin 권한을 발급하지 않는다.

## 사용자 플로우
1. `/login` → **회원가입** 탭, 표시 이름·이메일·영문과 숫자가 있는 10자 이상 비밀번호·확인 입력.
2. Supabase에서 이메일 인증을 요구하면 메일 링크 확인 후 로그인. 설정이 인증을 요구하지 않으면 즉시 로그인 가능. 이미 가입된 이메일도 존재 여부를 특정할 수 있는 오류를 공개하지 않는다.
3. 동일 화면에서 **Google 로그인** 유지.
4. **비밀번호 찾기** → 이메일 안내 → `/auth/reset` 에서 새 비밀번호 설정. 가입 여부를 노출하지 않는 응답.
5. 로그인 이후 `/owner` 또는 `/#properties` 를 자유롭게 선택한다. 사용자가 자신이 올린 매물만 관리할 수 있는지 DB owner_id와 JWT sub로 검증한다.

## 실제 브라우저 테스트 — 이메일 별칭으로 두 계정 만들기
별도의 공유 비밀번호를 Git/홈페이지에 게시하지 않는다. 실제 이메일을 받는 주소 두 개를 준비한다. Gmail이라면 본인이 소유한 한 주소의 **plus alias**를 사용할 수 있다:
- 집주인: `내지메일아이디+dh-owner@gmail.com`
- 방문자: `내지메일아이디+dh-visitor@gmail.com`

두 개는 Supabase의 서로 다른 user ID로 등록된다. 두 개 모두 메일 확인(필요 시)을 끝내야 한다. **이 문자열은 예시이며 생성된 실제 계정이 아니다.**

### 검증 시나리오
1. 첫 번째 주소로 가입 및 로그인 → 집주인 진입 → 매물 등록 → AI 대리인 설정에서 반려동물 조건·방문 가능 시간 등록.
2. 로그아웃 또는 별도 시크릿 창에서 두 번째 주소로 가입/로그인 → 첫 번째 매물 검색 → 문의 채팅 → 반려동물 질문 → 방문 예약 요청.
3. 집주인으로 접속 → /owner에서 확인 요청·방문 예약 승인 → 방문자가 거래방에서 확정 결과 확인.
4. 두 계정이 서로의 `/owner` 매물을 조회/수정하지 못하는지 확인한다.

## 관리자가 실제 테스트 계정과 랜덤 비밀번호를 발급하려면
`web/scripts/provision-test-accounts.mjs` 스크립트를 **운영자 로컬 환경에서만 명시적 승인 후** 실행한다.
Supabase 대시보드에서 프로젝트의 service_role 권한을 가진 운영자만 접근할 수 있다.
필수 환경변수: `PROVISION_TEST_ACCOUNTS=YES`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`TEST_OWNER_EMAIL`, `TEST_VISITOR_EMAIL`.
운영자에게 표시되는 임의 생성 강력한 비밀번호는 실행 당시 한 번 출력되고 Git·DB·로그 파일로 저장하지 않는다.
이 스크립트를 CI·Vercel 빌드·공개 API에서 호출하면 안 된다.
계정 삭제는 Supabase Auth 관리 화면에서 직접 수행한다. 인증 비밀키를 ChatGPT 대화나 Git에 공유하지 않는다.

## Supabase Auth 설정 확인
Dashboard > Authentication > Providers > Email: Email 제공자 및 가입 허용 여부 확인.
Dashboard > Authentication > URL Configuration: Site URL과 **Redirect URLs**에
- `https://meta-p2p-realestate-direct-home1.vercel.app/auth/callback`
- `https://meta-p2p-realestate-direct-home1.vercel.app/auth/reset`
등록. Google 로그인 callback(기존)도 유지.
이메일 인증 메일 발신/전달이 제한되면 Supabase SMTP 설정 확인.
로그인 세션이 만료되면 다시 로그인해야 한다(토큰 refresh/SSR cookie는 후속 보안 개선).

## 보안
- 비밀번호 하드코딩·로그 저장 금지, Auth 사용자 여부 노출 방지, 신규 가입 요청 서버 IP 레이트리밋/서버측 입력 검증.
- 공유 고정 데모 비밀번호를 운영 환경에 게시하지 않는다. 운영 DB에 테스트용 매물을 넣을 경우 합성임을 명시하고 테스트 후 삭제한다.
- 비밀번호와 확인 메일 링크는 실제로 관리하는 이메일을 통해 전달해야 한다.
- 테스트 계정 두 개는 '집주인/방문자' 고정 role이 아니다. 각자는 본인이 등록한 매물의 소유자인 경우에만 관리 권한을 가진다.
