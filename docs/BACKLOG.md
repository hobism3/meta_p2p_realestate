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
  운영 DB·비밀키 참조 없음(스캔済). push 승인 후 첫 실행 결과를 Checks에서 확인해야 한다.
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

## P4 집톡이 AI 구현 — TODO

- [x] 스펙(`AI_CHAT_ASSISTANT_SPEC.md`).
- [ ] 조건 초안 API + UI 틀.
- [ ] Muse Spark 프록시 + 합성 대화 테스트.

## P5 독립 검증·보안 — DONE(반복)

- [x] 감사 4회 + 재검증 2회. 수용 위험 3건 기록(토큰 노출·근사 rate limit·실브라우저 미확인).

## P6 해커톤 제출 — TODO

- [ ] 제출물·발표자료.
