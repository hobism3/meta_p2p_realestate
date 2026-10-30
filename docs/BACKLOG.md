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
- [x] 운영 배포 성공(`84011fd`, Vercel success). CI fast·e2e 둘 다 success — 기존 14/18 실패 해소.
  Preview 실패(`7b04e9c`)는 원인 확정: 해당 커밋에 demo setup `await` 누락이 있었고,
  후속 `5e91161`에 포함되어 해소. 무시해도 됨. main=`m1-auth-rooms`=`84011fd`.
- 소셜 제공자 확정: Google만 제공. 카카오·네이버 진입점 제거됨(VS-2A, a84bf53).
  카카오(사업자 인증 필요)·네이버(Supabase 미지원)는 Google 단일 흐름으로 대체한다.
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
- [x] 공용 메시지 조회 권한 해결(VS-2A): 공용 스레드 GET에 로그인 요구. 기존 데이터는 보존.
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

## VS-2A 매수 흐름 — DONE

- [x] 매매가 별도 필드: `006_sale_price.sql` + POST/PATCH 검증(매매가 필수) + 기존 전월세 보존.
- [x] 시드 매매 4건(s21~s24). 시드는 소유자 없음 → 시연으로 구분, 실제 거래처럼 처리하지 않음.
- [x] 메인 집 사기 모드 + 매매 필터 + 매매가 상한. 상세 매매가 표시.
- [x] 문의→독립방: 본인 매물 400, 소유자 자동 참여, 시드 매물은 시연방.
- [x] 내 방 목록(`/rooms`, `GET /api/rooms`) + 방 정보(`GET /api/rooms/[rid]`) + 5초 자동 갱신.
- [x] 구 공용 `/deal` 신규 UI 링크 제거. 데이터 보존, 공용 스레드 GET 로그인 요구.
- [x] 검증: `node --test` 10종 109/109 green(빌드 포함). 참여자 공유·새로고침 유지·제삼자 403·무인증 401.
- [x] Google 실로그인 vs 테스트 JWT 구분 기록: 실로그인은 운영 수동 확인済(2026-10-28), 자동 테스트는 self-mint HS256만 사용.
- [x] CI `verify-fast`에 m1auth·m1brooms·m1agent 포함. 운영 DB 쓰기 E2E 없음(격리 DB).
- AI 집톡이·시연 에이전트는 mock 유지. 실제 Meta API 미연결(이번 범위 밖).

## VS-2B 구 거래방 제거 + AI 상대방 Mock — DONE

- [x] 구 공용 거래방 UX 제거: `/deal/[id]` 페이지 삭제, 신규 UI 링크 없음. 모든 채팅 `/rooms/[rid]` 통일.
- [x] 구 공용 API 폐쇄(410): messages·visits·agreements·checklist. 과거 데이터 보존. 방 생성 API 유지.
- [x] 시드 문의→AI 시연방 자동 연결: 매매=AI 매도자, 전월세=AI 임대인. 첫인사 + 사람 1건당 AI 최대 1건(프로세스 내 뮤텍스+최종발언 가드).
- [x] 실거래방(소유자 있음)에는 AI 개입 없음. 시연/실거래 뱃지 + (AI) 표시 + 응답 중 표시 + 중복 전송 방지.
- [x] 검증: `node --test` 10종 110/110 green(빌드 포함) + E2E 20/20(desktop·mobile, 시연방 AI 첫인사·대화·새로고침 포함, 실측).
- VS-2C(실제 Muse 연결)·VS-3A(집톡이 개입)는 미착수.

## VS-2C Agent Service + Meta 연동 기반 — DONE(mock)

- [x] 키 확인: 로컬 MODEL_API_KEY 없음 확인(값 미출력). Vercel 서버 환경은 여기서 확인 불가, 별도 설정 필요. 실제 호출 검증 BLOCKED.
- [x] 응답 경로 통합: 메시지 POST 훅 제거 → 공통 Agent Service(`lib/agent-service.ts`) + `POST /api/rooms/[rid]/agent/invoke` 단일 실행점.
- [x] 사람 저장→AI 생성 분리: POST는 사람 메시지만 저장, 클라이언트가 invoke 호출. 입력 중 표시·실패 안내·다시 시도.
- [x] DB 중복 방지: agent_runs 유일키(room_id, trigger_msg_id, agent_type) + 상태(running/done/failed). Map 잠금 제거. 재호출은 기존 결과 반환.
- [x] Meta 전송(`lib/meta.ts`): chat completions, Bearer 키(서버 전용), 20초 타임아웃, 300 토큰, 최근 12건. 키 없으면 no_key 종료(조용한 mock 전환 없음).
- [x] 실행 기록: room/trigger/agent/provider/model/상태/지연/실패유형/사용량. 키·대화원문 미기록.
- [x] 검증 A-J: node 128/128 + E2E 20/20. A(매매 AI)·B(전월세 AI)·C(협상 이어짐)·D(방 격리)·E(실거래 제외)·F(재호출 1건)·G(동시 3건→1건)·H(실패 안내)·I(키 없음 명시)·J(provider·model 구분). 실제 모델 호출 없음.
- VS-3A(집톡이 개입) 미착수.

## VS-2D 가상 매도자 페르소나·단답 최적화 — DONE(mock)

- [x] 24개 시드 전부에 고정 페르소나(`lib/personas.ts`): 표시명·역할·성격·말투·응답 스타일·협상 태도·정책·모름 대응. 매매=seller, 전월세=landlord. 매물에 없는 사실 추가 없음.
- [x] 협상 정책 3종(none/undecided/ranged) 명시. blanket 90~100% 폐지. 범위 밖·미정은 "그 금액은 어렵습니다.", 임의 할인 없음. 미정은 정가 고수로 답하고 '확인 필요'로 미루지 않는다.
- [x] 단답 규칙: 한 문장(15~50자)·목록/마크다운/이모지/역질문/반복인사/요약 금지. mock 문구도 1문장으로 단축.
- [x] 경량화: reasoning_effort minimal 최상위 전달, model 유지, 대화 8건, 예산 1024 유지(잘림 재발 없음). 문자열 자르기 없음. 새 env 없음.
- [x] 맥락: 같은 room_id만 사용. 집톡이 메시지는 [이름] 접두로 구분.
- [x] 검증 1-10: node 144/144 + E2E 20/20. 1(말투 4종 상이)·2(동일 답)·3(가격·면적 정확)·4(단문)·5(추측 거부)·6(정책 준수)·7(제안 이어짐, mock 무상태 한계 명시)·8(방별 가격 분리)·9(잘림 없음)·10(E2E 유지).
- [ ] 실측 한계: 실제 Meta P50/P95·토큰·단답 준수율·실응답 예시는 키 보유 환경에서 별도 측정 필요(BLOCKED). mock 응답은 수 ms.

## VS-3B 거래 현황 상세·사용자 확인 — DONE(mock)

- [x] 의미 검증 강화(`lib/ziptalk-service.ts`): 같은 방 근거·발화자 일치·원문 뒷받침 검사, 금액 정규화, 연도 날조·비정상 날짜 거부. 최초가(매도자 발화 근거)/매수 희망가/매도 제안가 분리. 서로 다른 가격 자동 충돌 판단 제거.
- [x] 사용자 확인: `009_confirm.sql`(확인자·시점·버전) + `POST /api/rooms/[rid]/conditions/confirm`. 토큰 신원으로만 기록(AI 확인 불가). 값 변경 시 이전 확인 자동 무효.
- [x] 상세 패널(`/rooms/[rid]`): 가격·일정·조건 그룹, 미정 표시, 확인하기 버튼, 확인됨/확인 지남 뱃지, 근거 보기 이동. 새로고침 유지, desktop·mobile E2E 확인.
- [x] 검증: build 성공 + node 181/181 + E2E 22/22. 단위(정규화·화자 불일치·근거 없음·연도 날조 거부)·HTTP(최초가·확인→무효·404·제삼자/비멤버 403·방 격리)·PG 008·009 적용(pg-mem)·E2E(제안→확인→변경→확인 지남). 수정 2건: 라우트 인증 컨벤션, E2E 로케이터(변경이력 중복).
- [x] CI `verify-fast`에 `ziptalk.test.mjs`·`m1ziptalk.test.mjs` 등록.
- [ ] Meta 실분석 미검증 — BLOCKED(서버 `MODEL_API_KEY=unset` 확인, 값 미출력). mock 결과를 실제처럼 표시하지 않음. 키 확보 후 `tests/meta-smoke.mjs` 절차로 측정 예정.
- [x] 집톡이 반복 안내 수정: 바뀐 조건이 없으면 말풍선을 남기지 않는다(같은 문구 중복 차단). 아는 가격·일정은 질문에 한 문장으로 직접 답한다. Meta 프롬프트에 중복 안내·`확인 필요` 반복 금지 추가.
- [x] 매도자 확인-미루기 수정: 페르소나 24개 모름대응을 `그 부분은 정해진 게 없어서 답하기 어렵습니다`로 통일(기존 `직접 확인해 주세요` 계열이 Meta에서 그대로 반복됨). 프롬프트에 사실 우선 답변 + 확인요청 4종 금지 + 같은 말 반복 금지. mock 폴백도 `시나리오에 없어 답하기 어렵습니다`로 변경.
- [x] 매도자 자율 대화 전환(사용자 요청): 미정(undecided) 9개 협상태도를 `상황에 맞게 받아들여도 된다`로 완화, 프롬프트를 `그럴듯하게 정해서 답해도 된다·매수 제안 받아들여도 된다·앞뒤 논리만 맞추기`로 변경. 계약확정 금지·지어내지 마 삭제, 등기부·법적 효력 보장은 유지. mock은 결정적 테스트 더블로 유지(엄격)와 Meta 자유대화 간 괴리 명시.

## VS-3C 방문 일정·거래 진행 — DONE(mock)

- [x] 날짜 해석(`lib/visit-dates.ts`): 내일/모레/다음 주 요일·M월 D일·HH:MM·오전/오후 N시 반. 메시지 작성 시각 KST 기준. `다음 주` 단독·과거·없는 날짜·표시 없는 작은 시간은 null(임의 확정 금지).
- [x] 방문 제안→행 동기화(집톡이 실행 내): 시간 확정 제안만 `visits` 행(제안됨, proposed_by, 근거). 같은 방·같은 일시 중복 생성 방지. AI 시연 제안은 `시연 제안(실제 예약 아님)` 표시.
- [x] 거래 진행: `010_visits.sql`(제안자·근거·결정자·결정시각) + 일정 확인(수락됨+방문일 확인)/거절/변경요청(입력 포커스). AI `계약 가능` 발언은 확정으로 집계하지 않음.
- [x] 버전 지정 확인: confirm에 `{version}` 지정 시 불일치면 409. 확인 주체 표시(confirmed_name). 값 변경 시 이전 확인 무효 유지.
- [x] 검증: build 성공 + node 203/203 + E2E 24/24. 단위(경계·연도·모호)·HTTP(생성·중복·확인·409·모호·403·격리)·E2E 합성 시나리오(제안→방문→확인→변경, desktop·mobile).
- [x] CI `verify-fast`에 `visit-dates.test.mjs` 등록. 운영 DB 자동 E2E 없음(격리 DB).
- [ ] Meta 실분석 미검증 — BLOCKED 지속. mock과 실제 결과 구분 보고 유지.

## VS-4A 채팅 UX·결함 수정 — DONE(mock)

- [x] 결함 6건: 실거래방 AI 호출 차단(클라이언트+서버 404 시연 없음), 전송 즉시 입력창 활성화(AI는 백그라운드), 최근 대화 스캔으로 AI 답 속 제안 포착, `보실 수 있어요` 제안 인식·질문 구분(맥락 포함), 매물 재문의 시 기존 방 재입장, 일정 수락 원자화(수락+조건확인을 한 트랜잭션, 409 시 둘 다 유지).
- [x] 채팅 UI: 좌우 말풍선·집톡이 안내 카드·간결 헤더(매물명·가격·AI 표시)·독립 스크롤+자동 스크롤·하단 고정 입력(Enter 전송/Shift+Enter 줄바꿈)·입력 중/분석 중 분리 표시·실패 호출만 재시도·안내+빠른질문(가격 협의/방문 가능일/옵션).
- [x] 거래 현황: PC 우측 사이드·모바일 하단 드로어, 가격·일정·조건·미확인·이력 카드, 근거 이동, `내가 확인함` 표기, 시연 제안은 `시연 수락`으로 표시(실제 예약 아님), 집톡이 말풍선에서 현황 열기.
- [x] 검증: build 성공 + node 210/210 + E2E 신규 2건(desktop·mobile) 통과. 전체 E2E는 이 환경에서 지도 타일 대기·잔존 프로세스 포트 점유로 행 발생이 있어, 잔존 테스트 서버 정리 후 재실행 필요. mock·Meta 구분 유지, 운영 DB 자동 쓰기 없음.
- VS-4B는 아래 거래 정합성으로 확정(사용자 지시). 메인·매물 상세·등록 UX는 별도 단계로 남김.

## VS-4C 양측 합의 — DONE(mock)

- [x] DB(`011_proposals.sql`): room_proposals(조건·값·버전·근거·visit 연결·상태 proposed/agreed/refused/superseded·카드 메시지 연결)+proposal_approvals(제안·주체 복합키). room_conditions·history 보존.
- [x] 합의 서비스(`lib/agreement-service.ts`): 구체 조건만 카드화(방문일은 시간 필수, 정오·자정 단독은 묻기만), 버전 증가·열린 구버전 superseded·합의된 과거 보존·동일 주체 중복 409·버전 불일치 409. 시연방 AI는 협상 정책으로 즉시 판정(ranged 범위 안 동의·밖 거절, none 정가 미만 거절, AI 자신 제안 동의). 사람 동의는 토큰 신원만.
- [x] API: `GET /proposals`(멤버만, 제안+승인+양측+me), `POST /proposals/create`(실거래방 수동 생성, 근거 검증), `POST /proposals/[pid]/decide`(agree/refuse+버전). 합의 시 방문 수락됨, 거절 시 거절됨으로 연동(제안됨일 때만).
- [x] UI: 채팅 집톡이 말풍선 아래 합의 카드(양측 상태·동의하기·거절하기·변경 제안·보류·근거 보기), 거래 현황 합의 행으로 교체(확인하기 제거), 실거래방에도 현황 개방. AI 시연 동의는 실제 계약 아님 문구.
- [x] 검증: build 성공 + node 256/256 + `tests/agreement.test.mjs`·`tests/m1agree.test.mjs`(시연방 카드·AI 선동의·양측 동의·중복/구버전 409·supersede·범위밖 거절·방문 수락 연동·계약금 3,850만원 합의·타인 차단, 실거래 2인 합의·거절). E2E 로컬 28/28(데스크톱·모바일). 원인 수정: 모바일 서랍이 전송 버튼을 가려 60초 소진 → 후속 전송 전 서랍 닫기로 사용자 흐름과 일치시킴(타임아웃 증가 없음). Meta 실호출 BLOCKED(`MODEL_API_KEY` 없음). mock·Meta 구분 유지, 운영 DB 자동 쓰기 없음.
- 다음: 메인·매물 상세·등록 화면 UX 개선.

## VS-4C.2 Meta 실대화 정합성·양측동의 UX 복구 — 진행 중(mock)

- [x] 금액 파서 통일(`lib/visit-dates.ts` `parseManwon`): 7억1천·3억8천·3억8,500만원 정규식 일원화. `normalizeValue` 7억1천 /10 오류 제거.
- [x] AI 동의 강화: 수락 발언 일치·발화자별 생성(기존 커밋 003c00b 유지).
- [x] 방문 모호 처리: `bareHour`(표시 없는 1~11시는 후보로 묻고 기록·카드 금지), `normalizeDateTypo`(토오일→토요일), `그때/그날/그 시간` 지시어는 같은 방 최신 일정 되묻기. 말풍선만 있는 결과는 silent로 버리지 않음.
- [x] 제안 단서 추가: `어떠세요` 계열을 PRICE_MARKERS에 포함(s23 실제 대화 "7억1천은 어떠세요" 카운터가 통째로 누락되던 문제 수정).
- [x] 채팅↔패널 연결: 집톡이 분석 후 패널이 닫혀 있어도 제안 목록 갱신(`app/rooms/[rid]/page.tsx` `callZiptalk`). 401은 정상 상태코드로 반환되며 조용히 무시됨(패널이 오래된 표시 유지, 채팅 흐름 차단 없음).
- [x] 첫인사: `moveInText()`로 ISO 날짜 한국어 표기("2027-01-10합니다" → "입주일은 2027년 1월 10일입니다"). 시나리오 입주일 표기 통일.
- [x] s23 회귀(`tests/ziptalk.test.mjs`): 7억 희망→70,000만원 기록, 7.1억 카운터→매도 제안가+미확정 안내(합의 아님), 토요일 1시→후보 질문·방문일 미기록. 첫인사 회귀(`tests/demo.test.mjs`): s23 원문 날짜 노출 금지.
- [x] 검증: build 성공 + node 267/267 + E2E 로컬 28/28(desktop·mobile). E2E 초회 실패는 stale `data/e2e.db`(WAL 3.9MB) 환경 문제로, E2E 소유 DB만 삭제 후 청정 재실행으로 44.6초 만에 전량 통과(코드 수정 없음). `tests/demo.test.mjs` 신설.
- [ ] Meta 실측 미검증 — BLOCKED 지속. mock과 실제 결과 구분 보고 유지.

## VS-4C.3 거래유형별 합의 모델 — DONE(mock)

- [x] 유형 분리(`lib/rent.ts` 신규): 최종 후보는 매매 `최종 매매가`, 전세 `최종 전세보증금`, 월세 `월세 조건(보증금+월세 묶음)`. 희망·역제안·최초가는 이력 전용, 카드·동의 버튼 없음. 임대차에 매수·매도·AI 매도자 표현 금지(라벨 임차인/AI 임대인).
- [x] 수렴 1카드: 양측 최신값이 일치할 때만 최종 후보 1건 생성. 월세는 두 값 모두 일치해야 하며 한 값 변경은 새 버전, 과거 승인 재사용 금지. 시연 동의는 모든 값의 명시적 수락 근거가 있을 때만, 모호함은 보류(거절 아님).
- [x] 추출·검증 분리: `analyzeMock`·`buildZiptalkInput`·`validateZiptalkOutput`에 tradeType 계약. `보증금 5000/월세 65`→(5000,65). Meta 오표기(매수 희망가 5000·매도 제안가 65) 거부, 두 금액 매매가 해석 금지, 묶음 문맥 검증.
- [x] mock 협상 기억: 임대차·방문 mock 응답이 현재 협의값을 기준으로 수락한다. 사람 제안 방문행의 제안자가 demo로 뒤집히던 문제 수정(사람 우선 동기화, 동일 일시 중복 생성 없음).
- [x] UI: 카드 1개(`보증금 5,000만원/월세 65만원 조건에 동의할까요?`, [동의][변경][거절], 시연 문구), 유형별 현황(최초·현재 제안·양측 상태·근거·버전), 구형 단독 확인 410 제거.
- [x] 기존 기록 정책: `diagnoseLegacyProposals`(임대차 매수·매도명·비묶음 월세 카드 보고) 읽기 전용 진단. 승인 이력 임의 변경 금지, 합의된 과거는 superseded하지 않고 보존.
- [x] 검증: build 성공 + 단위 144/144(`rent.test.mjs` 32건·s02 골든 포함) + Fast HTTP 164/164(m1agree 22건·s02 두값→1카드→양측→새로고침·한값변경·철회·전세·실2계정) + E2E 28/28(청정 DB). Fast CI 기존 방문 2건 실패 해소(원인: mock 방문 무응답→증거 없음→대기, 테스트 삭제·무조건 수락 없이 mock 응답修正). `verify-fast.yml`에 rent 포함.
- [ ] Meta 실대화 검증 — 사용자 담당. mock·Meta 분리 보고 유지. 운영 DB 자동 테스트 없음.

## VS-4B 거래 정합성 — DONE(mock)

- [x] 매도자 기억: room 조건·방문 최신 상태를 `formatDealState`로 요약해 Meta 프롬프트에 주입(매수 희망·매도 제안·확인 구분, 계약금 10% 기준액은 협상가 기준 서버 계산). 집톡이 발화 오인 금지·완료 행세 금지·방문≠계약확정 문구 추가. mock 경로(골든 고정)는 손대지 않음.
- [x] 집톡이 강화: 한 턴 복수 조건 수집, 인사말 제안 오인 제거(사람 트리거는 사람 발화만), `가능합니다` 수락의 매도 제안가 기록, 계약금(비율→금액 서버 계산)·계약일·잔금일·인도일·입주일 추출, 월 정밀도(`YYYY년 M월`, 일 임의 생성 금지), 잔금≠입주 시 인도일 확인 안내(오류 아님), 확인된 조건 변경 시 재협의 안내.
- [x] 방 페이지: AI 답에 새 단서(제안 표식·방문·일정 단어)가 없을 때는 사람 메시지를 집톡이 트리거로 넘겨 아는 질문에 답하게 함(`hasNewProposalCue`). AI 방문 제안도 시연 제안 `visits` 행으로 만듦(질문만으로 생성 금지 유지).
- [x] 거래 현황: 계약금·인도일 행 추가, 잔금≠입주(인도 없음) 불일치 배너+근거 버튼, `확인 지남`→`재협의 필요` 표기.
- [x] 검증: build 성공 + node 233/233 + `tests/m1deal.test.mjs` 9/9(3.9억→3.85억→계약금 3,850만원→방문→잔금 다음달 15일→입주 내년 2월→인도일 안내). E2E는 로컬에서 `거래 현황` locator 부분일치 충돌(`exact: true`), 프로젝트 간 사용자 공유 오염(사용자ID 분리), 구 DB 잔재를 수정. 전체 E2E는 CI `verify-e2e`에서 확인. Meta 실호출 BLOCKED(`MODEL_API_KEY` 없음). mock·Meta 구분 유지, 운영 DB 자동 쓰기 없음.
- 다음: 메인·매물 상세·등록 화면 UX 개선.

## VS-3A 집톡이 분석·개입 — DONE(mock)

- [x] 분석 서비스(`lib/ziptalk-service.ts`): room 대화+매물+이전 조건 → 조건·개입 판정. mock=정규식 기준선, meta=JSON 출력. confirmed 절대 생성 안 함, 근거 없는 조건 저장 안 함.
- [x] 상태 저장(`008_ziptalk.sql`): room_conditions(room_id별 조건·버전)+condition_history(변경 이력 보존). source_msg_ids로 근거 연결.
- [x] 실행: `POST /api/rooms/[rid]/ziptalk/invoke` + `GET /api/rooms/[rid]/conditions`. agent_runs agent_type=ziptalk 분리. 트리거는 사람·매도자만(집톡이 409). 시연방 전용(실거래 403). 수호 규칙은 매도자 invoke와 동일(authenticate·멤버).
- [x] UI(`/rooms/[rid]`): 집톡이 말풍선(집톡이 표기, author_type=assistant)·[거래 현황] 패널(가격·미확인·변경이력·근거 보기·초안 문구)·[집톡이 호출] 버튼. 매도자 응답 후 자동 분석(조용하면 말풍선 없음).
- [x] 검증: node 166/166 + E2E 22/22(desktop·mobile). 제안 기록·변경 이력·중복 방지·무관 대화 침묵·미확인·방 격리·AI무반응·제삼자/실거래 403. 수정 3건: 라우트 인증 컨벤션(x-user 미사용)·마이그레이션 목록·Map spread(ES5 target).
- [ ] 실측 한계: Meta 집톡이 분석 품질·토큰은 키 보유 환경에서 별도 측정(BLOCKED). mock은 수 ms.
- 다음 VS-3B: 거래 현황 상세화·사용자 확인·조건별 변경 이력 관리.


## UX Refresh - 단계형 매물 등록 (2026-10-30, 후보)

- [ ] IMPLEMENTED: 5단계 시작/공간/거래/생활/검토 Wizard.
- [ ] IMPLEMENTED: PDF AI 초안 반영 후 공간 정보로 연결, POST/PATCH 계약 유지.
- [ ] IMPLEMENTED: 모바일 반응형, 실시간 PC 요약, 단계 검증, 탭 단위 임시보관.
- [ ] QA: 빌드, Wizard 단위, desktop/mobile Playwright, 기존 PDF 및 등록 동작.
- [ ] 승인 없이 main 병합/운영 배포 금지. 상세: docs/REGISTER_WIZARD_UX.md.
