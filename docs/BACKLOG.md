# DirectHome 백로그

## P0 개발 프로세스 정립 — DONE

- [x] AGENTS.md·BACKLOG·QUALITY_GATES·DECISIONS 정비.

## P1 외부 접속 가능한 웹 배포 — DONE

- [x] Vercel 배포. health `up`, listings 200.
- [x] Supabase 연결. 테이블 10개, 마이그레이션 자동.

## P2 기존 웹 기능 및 모바일 검증 — DONE

- [x] 페이지·API 스모크(로컬·운영).
- [x] Playwright E2E 14개(데스크톱·모바일). 탐색·상세·등록·거래방·넘침.
- [x] M0: READ_ONLY 차단 브랜치에서 검증. POST 403, GET 200.

## M0 잔여(다음 작업)

- [ ] 방 분리(room_id) — M1 설계 완료. M1에서 구현, 이번에 손대지 않음.
- [ ] 참여자 권한 검사 — M1 설계 완료. M1에서 구현, 이번에 손대지 않음.
- [ ] TLS 검증 활성화(supabase 연결 검증 후).
- [ ] 문서·코드 상태 일치 유지.

## M0.5 운영 반영 검증 — IN PROGRESS

- [x] READ_ONLY=true 회귀: 쓰기 7종 403, 조회 4종 200 (`web/tests/readonly.test.mjs`, 11/11 통과).
- [x] 단위·API·DAL: `node --test` 총 58건 통과(23+15+20). 테스트 전용 DB 격리(pid별 sqlite), 운영 DB 미사용.
- [x] 지도 마커 표시·클릭·매물 연동 + 모바일 넘침 3경로 + 서버 자동기동(webServer) 추가(미커밋).
- [x] 커밋 보존(2026-10-28, m0-write-block, push·병합 미실행).
  - `5672374` 보안: `web/tests/readonly.test.mjs` (11/11 green 실측).
  - `73c0df8` E2E 커버리지: `m0.spec.ts` 지도 2건·모바일 넘침 확장 + `MapView.tsx` ready 게이트 (desktop 지도 3/3 green 실측).
  - `ea2cec5` 환경·CI·문서(미검증 분리): `playwright.config.ts` 브라우저 경로 고정+workers:1,
    `.github/workflows/verify.yml` 신규, 원칙 문서. exit-0 미확보 상태로 명시.
- [ ] Playwright 종료코드 0 확보 — BLOCKED(환경). 반복 실행 금지.
  - 기실행 18건 전패(원인 확정): 실행기 기본 경로에 `chromium_headless_shell-1248` 없음.
    `test-results/*/error-context.md` 18건 모두 launch 실패. 코드·서버 문제가 아님.
  - 지도 desktop 3건 PASS 실측(`3 passed (1.5m)`, 실Chromium). 단 당시 종료코드 1은
    CLI `--global-timeout=90000` teardown 레이스(테스트 실패 아님). 설정에서 globalTimeout 제거済.
  - 단일 마커 재실행 1건: 7분+ 무출력 후 종료. 서버 미기동(`data/e2e.db` 11:50 이후 미접촉),
    health 무응답, 고아 node 0건·포트 닫힘 확인 후 정리. 동일 증상 재발이므로 재실행 없이 BLOCKED.
    장시간 명령 실행기 spawn도 이후 실패(`SpawnReadyDeadlineExpired`, 단문 명령은 정상).
  - 잔여: 실행 환경 복구 후 mobile 지도·넘침, desktop 나머지를 작은 단위로 실행. 18건 일괄 재실행 금지.
- [ ] CI 최초 실행: `verify.yml` 구성済(Node 22·build·단위/API·격리 Playwright·실패 trace).
  운영 DB·비밀키 참조 없음(스캔済). push 후 `verify-fast`·`verify-e2e` 2건 시작됨(아래). 결론 확인 후 기록한다.
- [x] push 성공(2026-10-28): `2040bfd..9c7453d m0-write-block`. 1차 토큰은 `workflow`
  scope 부족으로 거부됨을 확인 후 재시도 없이 중단, 2차 토큰으로 1회 성공. 토큰 미저장.
- [x] `m1-auth-rooms` push 성공 → Vercel Preview 빌드 success(커밋 상태 success).
  URL: `https://meta-p2p-realestate-git-m1-auth-rooms-direct-home1.vercel.app`
- [x] Preview 외부 검증(보호 해제 후, GET만 실측).
  health 200(`db:up`)·listings 200(합성 시드)·`/` 200 렌더·`/login` 200(개인정보 경고)·
  `/api/auth/me` 무토큰 401·공용 스레드 200(빈 배열). POST 401·타인 403·로그인 성공·모바일은
  미확인(서버 측 GET 전용 + 로컬 DNS 불가). 실행 안 한 항목 PASS 표시 없음.
- [x] 분리 구현(`2210522`): `VERCEL_ENV=preview`이면 `DATABASE_URL` 무시하고 sqlite.
  로컬 실측 `PREVIEW-KIND=sqlite`. `/api/health`에 `kind` 추가.
- [x] 개발 방식 변경: `main`에서 직접 개발. Preview 따로 검증하지 않음.
- [x] 분리 외부 증명 완료: Preview `/api/health` → `{"ok":true,"db":"up","kind":"sqlite"}`.
  매물 목록도 sqlite 시드에서 정상 200. Preview 쓰기 테스트 금지 해제(휘발성 sqlite, 운영 무관).
  Production은 Supabase 유지.
- [x] Preview sqlite `down` 수정(`80db5ee`, 푸시済): Vercel 서버리스 쓰기 가능 경로(`/tmp`)로
  변경. 재배포 후 `/api/health`가 `{"ok":true,"db":"up","kind":"sqlite"}`여야 정상.
- 소셜 제공자 확정(공식 문서): Google·카카오는 Supabase 내장, 네이버는 미지원.
  네이버 버튼은 `custom:naver` 식별자로 전달하며 대시보드 Custom OAuth 등록이 필요하다.
- [x] M1 분리 브랜치 준비: `m1-auth-rooms`를 main에서 생성(빈 브랜치, 구현 없음).
  보안 운영 반영(READ_ONLY=true·main 병합·배포)은 별도 승인 게이트 유지.
- [ ] 자격증명 교체: 워크트리·히스토리 키워드 검사 무노출. 운영 대시보드 교체 여부는 사용자 확인 필요.
- [ ] main 병합 + READ_ONLY=true 운영 적용은 승인 후 (절차 준비됨, 미실행).

## P3 사용자 인증·DB·다중 사용자 거래방 — DONE(부분)

- [x] 서버 DB + DAL 이중 지원 + 외래키 + 버전관리.
- [x] dev 별명 + Supabase JWT 검증 코드. 실연동은 계정 설정만 남음.
- [x] 거래방 서버 공유. author·role 구분.
- [x] Supabase Auth 로그인 UI → M1-A에서 구현. 아래 참조.

## M1-A 사용자 인증 — DONE(코드, `m1-auth-rooms`)

- [x] 구현: `003_authn.sql`(owner_id·user_id·participants), `lib/auth.ts`(신원만 검증,
  role 비권한)·`lib/authz.ts`(DB 역할)·전 쓰기 API 인증·`/api/auth/login·logout·me`·
  `/login` UI·Bearer 배선. dev 별명은 `ALLOW_DEV_AUTH=true` 명시 로컬 전용
  (운영 무플래그 쓰기 401). `user_metadata.role` 권한 사용 금지.
- [x] 검증: `node --test` 총 68건 통과(auth 10·m1auth 8·api 15·readonly 11·단위·DAL 9).
  격리 sqlite, 운영 DB 미사용. 수정 1건: `next start`가 NODE_ENV=production을 강제해
  dev 판별 불가 → 플래그 방식으로 교체 후 재빌드·68/68 green.
- [ ] 실제 Supabase 연동 미검증: self-mint HS256 토큰으로만 검증. 실값 투입 후
  `/login` 수동 확인이 남음. 그 전까지 공개 데모에 개인정보·실제 거래 대화 금지.
- [ ] 공용 메시지 조회 권한 잔여: 메시지 GET은 로그인 없이 공개(M1-B에서 해결).
  기존 공용 메시지를 개인방에 자동 귀속시키지 않음.
- [ ] M1-B 착수 가능: Listing·DealRoom 분리 설계 유지. M1-B·집톡이 미구현.
- main 병합·운영 배포 금지 유지. CI 미실행은 PASS로 표시하지 않음.

## M1-B 독립 거래방 — DONE(코드, `m1-auth-rooms`)

- [x] 구현: `004_rooms.sql`(deal_rooms·room_members·room_checklist·room_id),
  `lib/rooms.ts`(생성·멤버·조회), 방 API 6건(방 생성·목록·메시지·방문·합의·체크).
  공용 스레드 GET은 `room_id IS NULL`로 스코핑(방 메시지 유출 차단).
  기존 공용 메시지 자동 귀속 없음. 역할은 DB만 사용.
- [x] 검증: A(소유자)·B·C 시나리오 `m1brooms` 6/6 + 전체 74/74 통과, 종료코드 0.
  A-B 대화 C 조회·수정 403, 무인증 401, 참여자 공유·유지 확인. 격리 sqlite.
- [ ] 잔여: 방 UI(목록·입장·대화 화면)는 M1-C. 공개 메시지 GET 공개 상태 유지.
- M1-C 착수 가능. main 병합·운영 배포 금지 유지.

## VS-1 독립 거래방 UI 연결 — DONE(`m1-auth-rooms`)

- [x] E2E 원인 확정(실측): 구 설정에서 Bearer만 있고 `x-write-token`이 없으면 401.
  `NEXT_PUBLIC_WRITE_TOKEN` 노출 대신 인증 테스트 사용자(Bearer) 기반으로 전환.
- [x] 방 UI: 상세 `문의하기`→방 생성→`/rooms/[rid]` 채팅→새로고침 유지. 타인은 `조회 권한 없음`.
- [x] E2E 20/20(desktop 10·mobile 10, 종료코드 0). 기존 등록·메시지 실패 해소.
  수정 3건: 방 input placeholder 누락·타인 assertion 엄격모드·trace 경로(`web/test-results`).
- [x] `node --test` 90/90 유지. 합성 데이터만 사용(격리 sqlite).
- [ ] Preview 쓰기 테스트 금지: Preview·Production DB 미분리 상태이므로 원격 쓰기 검증은 하지 않음.

## AI 시연·집톡이 설계 — DONE(문서만, 구현 없음)

- [x] `AI_CHAT_ASSISTANT_SPEC` 개정: M1-B 구조 반영, 데모 에이전트와 분리, 방 스코프·확인주체 구분.
- [x] `DEMO_AGENT_SPEC` 작성: 시연 모드·005 모델·상태 흐름·API 스케치·검증 시나리오.
- [ ] AI-1: 005 마이그레이션(author_type·room_agents·demo_scenarios·agent_runs) + 적용 테스트.
- [ ] AI-2: author_type 서버 강제 + 위조 거부 테스트.
- [ ] AI-3: mock provider + 시나리오 응답 단위 테스트.
- [ ] AI-4: invoke API + 루프 가드(사람 1건당 AI 최대 1건, AI 작성에 무반응) 테스트.
- [ ] AI-5: 집톡이 추출·분류(제안·질문·희망·철회)·충돌 mock 테스트.
- [ ] AI-6: 집톡이 카드 UI 틀(mock 데이터).
- [ ] AI-7: 실제 Muse 연동(키 확보 후 수동 검증).
- [ ] AI-8: 시연 E2E(방 격리·AI 표시·미확정 확인).
- 전제: 매매 시나리오는 M1-C 매매가격 필드 필요. 무단 배포·운영 DB 테스트 금지.
- [x] AI-1~AI-6 구현·검증(89/89, 종료코드 0): 005·author 강제·mock 응답·invoke+루프가드·
  집톡이 추출·카드 UI 틀(`/demo/ziptalk`, mock). 수정 2건: 테스트 문자열(`등급` 미포함) 1건,
  제안 판정 순서("하자고" 충돌) 1건. 전부 원인 확정 후 수정·재검증.
- [ ] AI-7: 실제 Muse 연동 — BLOCKED(키 미확보). mock이 기본, provider 로그 분리済.
- [ ] AI-8: 시연 E2E — BLOCKED(실행 환경). 환경 복구 후 작은 단위로 실행.

## P4 집톡이 AI 구현 — TODO

- [x] 스펙(`AI_CHAT_ASSISTANT_SPEC.md`).
- [ ] 조건 초안 API + UI 틀.
- [ ] Muse Spark 프록시 + 합성 대화 테스트.

## P5 독립 검증·보안 — DONE(반복)

- [x] 감사 4회 + 재검증 2회. 수용 위험 3건 기록(토큰 노출·근사 rate limit·실브라우저 미확인).

## P6 해커톤 제출 — TODO

- [ ] 제출물·발표자료.
