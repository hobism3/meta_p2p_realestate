# DirectHome — 누적 개발 기록

이 문서는 매 단계의 **완료/미완료/검증 범위/다음 작업**을 구분하는 운영 기록이다.
변경 이력 상세는 커밋·PR·GitHub Actions에 있고, 완료 판정은 재현 가능한 테스트를 필요로 한다.

## 2026-11-01 · 기준선
- `main` = `2c3a2a6868c61028d492a0a56cb9d7dd7ea45f1e`, PR #12~15 병합.
- PR #12: 집주인 매물 관리/AI 설정 및 가능 요일·시간.
- PR #13: 사실 기반 집주인 AI 자동 응대·확인 요청함. 실매물에는 시연 AI가 가격 제안하지 않음.
- PR #14: 집주인/집 찾기 첫 화면, 60분 방문 슬롯 및 집주인 승인·취소. 기존 `visits`와 실제 예약 분리.
- PR #15: Supabase 이메일 회원가입·비밀번호 복구, Google 로그인 유지, 운영 DB PostgreSQL.
- 테스트: 각 PR GitHub CI 통과, PC·모바일 E2E 수행. **실제 Supabase 테스트용 사용자 두 개는 생성/검증되지 않음.**
- 현 구조 점검: 실제 거래방의 집톡이 진행 자동화 미연동, 예약 24시간 후에도 자동 만료 안 됨, `/owner` 일부 문구는 이전 단계의 미구현 설명을 유지.

## 2026-11-01 · Stage 0 예약 안정화
- **상태: 기술 구현·CI 검증·main 병합 완료 (PR #16, merge `a874a9a`)** (`feat/transaction-p0-stability-20261101`).
- 기능: 승인 대기 24시간 경과 시 next request lazy expiry, DB 슬롯 두 칸 복구, 승인 후 확정 상태 보존, expired/취소 구분, 동일 매물·방문자 활성 예약 1건 제한, SQLite tx 큐/PG listing 행 잠금.
- 검증(브랜치 09c10e2 기준): `npm run build` PASS, API·SQLite·예약 단위 15/15 PASS, Playwright 76 PASS/4 SKIP, GitHub verify-fast/e2e 성공, Vercel Preview READY.
- 실운영 Supabase의 실제 사용자 2계정 수동 E2E는 여전히 미검증이므로 별도 QA 게이트로 남긴다.
- 목표: 24시간 이상 답변 없는 예약 슬롯 해제, 재승인 거부, 상태를 이용자에게 '만료'로 명확히 표시, 남용 방지 및 낡은 문구 정정.
- 구현 후 이 항목에 실제 커밋, 테스트 건수, CI 상태, 병합 SHA와 잔여 과제를 추가한다.
- 제약: 외부 알림/앱 없음. 서버리스 환경에서는 **다음 예약 조회/신청/승인 시 lazy expiration**하며, 시간만 지났다고 사용자 기기에 알림을 보내는 기능이 아니다.

## 다음 Stage 1
- 서버 read-only `room/transaction-summary` projection으로 `owner_visit_bookings`·`room_proposals`·`room_conditions` 통합. AI 요약이 상태를 직접 수정하지 못하도록 입력/출력을 분리.
- 단계별 근거 메시지·확정자·버전·다음 확인 항목을 표준 형태로 제공. 데모 시연과 실거래는 별도 정합성 규칙 사용.

## 2026-11-01 · Stage 1 거래 상태 통합
- **상태: 코드·CI 검증·main 병합 완료 (PR #17, merge `110927d`)** (`feat/transaction-state-p1-20261101`).
- 프로덕션 Next 빌드 PASS, 독립 projection unit 6건 + Next API 4건 = 10/10 통과.
- 신규 실제 거래방 카드 양측 승인 Playwright desktop/mobile 2건 PASS. 전체 78 PASS/4 SKIP, GitHub verify-fast/e2e PASS, Production READY.
- 월세 제안은 입력 공백/쉼표를 받아도 서버에서 **보증금+월세 단일 표준 묶음**으로 저장하며, 한쪽 동의만으로 확정되지 않는다.
- 설계: `docs/TRANSACTION_STATE_P1_20261101.md`.
- 구현 범위: read-only room transaction projection, 6개 단계의 근거·확정·제안 상태, 실제 방 수동 카드 양측 승인 UI.
- 검증 완료: 실제 두 사용자가 카드 각각 동의해야만 확정되고, 실제 방문은 집주인 예약 승인만 확정.
- Stage 2는 실거래 집톡이 자동 개입·진행 안내. Stage 1 projection은 판단 기준선으로 재사용한다.

## 2026-11-01 · Stage 2 실제 거래방 집톡이
- **상태: CI 검증 및 main 병합 완료 (PR #18, merge `fd052907`)** (브랜치 `feat/real-jiptok-p2-20261101`).
- 설계: [실거래 집톡이 P2](REAL_JIPTOK_P2_20261101.md).
- 기능 범위: 서버가 사람 메시지 수신 후 집톡이 메시지를 생성; 질문과 제안을 구분; 구체적인 가격·생활 조건은 **확인 대기 카드** 자동 생성; 집톡이 발화를 그룹채팅에 인라인 저장; 양측 확정 시 계약 프로세스 다음 단계 안내; 방문 승인 이벤트 반영; 영속 멱등 원장.
- Stage 1의 거래 상태 기준을 재사용하며, **AI 스스로 동의·협상·방문 확정하지 않음**.
- Next.js production build PASS; 실거래 집톡이 단위·Next API·SQLite 테스트 통과. Playwright 신규 PC·모바일 시나리오 4/4 통과(합의 후 즉시 거래 현황 동기화까지 검증).
- 명시된 집주인 정책에 기반한 AI 대리인 반려동물 답변도 '제안'으로만 생성. `created_by='owner_agent'` provenance 저장 및 사람 2인 동의 전 confirmed=0.
- 같은 방의 중복 제안·동시 동의 동작은 방 row lock으로 직렬화; 경합 회귀 테스트 추가.
- GitHub PR #18 (`feat/real-jiptok-p2-20261101`)의 실제 CI 및 머지 상태는 [PR #18](https://github.com/hobism3/meta_p2p_realestate/pull/18)에서 확인한다.
- 검증: Next build PASS, 집톡이/합의/시연 격리 Node 회귀 75/75 PASS. P2 신규 Playwright desktop/mobile 4/4 PASS, 추가 이전 커밋 격리 전체 Playwright 82 PASS/4 SKIP.
- 최종 코드 커밋 `56b7ede9` 기준 GitHub verify-fast·verify-e2e **모두 성공**, Vercel Preview READY. 같은 sandbox에서 마지막 전체 회귀 재실행은 리소스 제한(exit 137)으로 중단됐으나 GitHub e2e 정상 완료로 확인했으며 이를 별도로 기록한다.
- 기존 검증을 새 요구사항에 맞춰 갱신: 실거래방은 **시연 상대 AI 금지, 집톡이 안내 허용**. room_agents 시연 시나리오가 붙은 커스텀 매물 방은 데모 엔진을 유지.
- 추가: 같은 방 제안·동의 동시 요청에서 DB 행 잠금으로 중복 제안 및 합의 갱신 유실 방어. 테스트에서 2인 동시 동의 후 agreed 증명.
- 운영 Production SHA와 PR #18 최종 merge SHA는 GitHub PR 기록을 기준으로 한다.
- 남은 범위: Stage 3 집주인 AI 대리인의 브라우저 독립 실행, 실운영 Supabase 계정 2개 수동 E2E, 실거래 계약/법률 검증.

## 2026-11-01 · Stage 3 Owner AI Durable Queue
- **상태: main 병합·CI 검증·Production READY 완료** (PR #19, merge `92c8294`).
- 설계: [OWNER_AI_P3_DURABLE_QUEUE_20261101.md](OWNER_AI_P3_DURABLE_QUEUE_20261101.md).
- 서버 `POST messages`에서 메시지+작업을 **동일 트랜잭션**으로 기록하고 즉시 처리. 브라우저 `invokeOwnerAgent` 후속 요청 제거.
- `owner_ai_jobs` 버전 정책/중복 방지/lease/재시도/terminal failed 원장; authenticated Vercel Cron 백업 복구; 집주인 수동 retry 및 실패 알림함/거래방 상태 안내.
- 보류: 실제 Supabase 두 계정 수동 운영 검증, 외부 Push/SMS/이메일, Pro 플랜 단위 분당 Cron 회수, 법률·보안 감사.
- Next production build PASS. 신규 owner-ai durable queue+기존 owner-ai+집톡이+SQLite migration 포함 Node API 22/22 PASS. 전체 Playwright 격리 desktop/mobile 82/86 PASS, 4 SKIP.
- Github verify-fast PASS; verify-e2e 첫 실행은 기존 모바일 시연방 방문 버튼 대기 테스트 1건 타임아웃(81 PASS/4 SKIP/1 FAIL), **실패 작업 재실행 후 성공**. 격리 Vercel sandbox Playwright 82 PASS/4 SKIP.
- Vercel Preview READY, Production READY(`92c8294`). 프로덕션 /api/health 200 / PostgreSQL up. 비인증 /api/cron/owner-agent 401. CRON_SECRET은 Production 암호화 환경변수로 구성(값 미공개).
- 이전 /owner-agent/invoke 도 queue pending/failed/disabled 시 추가 실행 차단. 운영 cron 하루 한 번은 백업 복구이며 즉시 성공을 보장하지 않음.
- 기술 판정: 집주인 AI 서버 트랜잭션·작업 복구·실패 관리 구현 완료. Vercel Cron의 다음 실제 예약 실행 기록, Supabase 실계정 2명 수동 E2E, 장애 SLA/보안·법률 감사는 미검증.

## 2026-11-01 · Stage 4/6 정리 및 P7 (권리 분석·집톡이 보조 고도화)

### 전달된 기준선과 실제 병합
- PR #20, `main@94108e1`: 복수 매물 집주인 허브, 방문/AI 요청 요약·매물별 대기 업무, 검색/정렬·거래방 이동. CI verify-fast/e2e PASS.
- PR #21: 개별 미처리 작업함 개선 **오픈, 미병합**. main에 반영된 것으로 해석하지 않음.
- PR #22, `main@b82272f`: 실 등기 PDF의 Meta 원본 전송 위험 발견 → SHA-256 허구 샘플 제한, 브라우저 선차단, 응답 필터링을 입력 마스킹으로 오인한 문구 정정. 신설 직거래 광고/게시자 규제와 개인정보·중개업/전자동의 법률 감사.
- PR #23, `main@41c6ae6`: 본인확인기관용 브리지·서명 콜백(기관 실제 미연결), 게시권한 자기진술, 실제 매물 신고 DB/관리 검토, 로컬 등기 확인 체크리스트; CI-fast PASS. 법률 비해당/소유자 인증 완료 판정 아님.

### 사용자 결정과 이번 P7 목표
- 정식 서비스 출시 단계가 아니므로 법률 검토·실사용 2인 거래는 보류하고 연구개발을 진행. 법률 결론을 위조하지 말고 확인된 근거와 **나중에 전문가에게 확인할 문제**를 계속 Git에 남기기로 결정.
- 집톡이는 거래 알선/협상이 아니라 **미확인 조건·다음 절차 안내**만 수행.
- 권리관계 분석은 핵심 제품 가치로 채택; 실 등기 API 제휴 전에는 합성/사용자 수동 입력을 통한 개인정보 최소화 방식으로 고도화.

### P7 변경 내용 — 코드 및 검증 진입
- `web/lib/registry-rights-analysis.ts`: 등기 기재의 권리종류, 현행/말소/미확인, 갑구/을구, 접수일, 사용자 입력 순위번호·근저당 채권최고액 구조화. 금액 미입력과 불확실성을 드러내고 **실제 채무잔액/선순위/회수가능액/안전판정 미계산**.
- `web/app/registry/check/page.tsx`: 기존 수동 체크리스트를 상세 편집, 허구 예시, 발급일·7일 자체 재확인 권고, 관련자 신원/선순위 임차인/세금/건축물대장 확인, 사용자가 직접 결과 메모 복사하는 UX로 확장. 입력을 서버/외부 AI에 보내지 않음.
- `web/lib/jiptok-support-tasks.ts`, `web/components/TransactionProgressPanel.tsx`: 실제 DB의 읽기전용 projection에서 확인대기·다음 질문·권리관계 확인을 표시. 채팅 자동 발화·가격 절충·임의 동의/승인 없음.
- `web/components/SiteNav.tsx`, `web/app/globals.css`: 등기 확인 경로 노출과 모바일 입력 UX.
- `web/tests/registry-rights-analysis.test.mjs`, `web/tests/jiptok-support-tasks.test.mjs`: 누락/말소/미확인/채권최고액/시간, 실제 확정·제안 구분, 협상 금지 회귀. `verify-fast.yml`에 포함.
- 설계·사유·미해결: [P7 설계/검토 기록](P7_RIGHTS_ANALYSIS_AND_SUPPORT_20261101.md), [등기/API 법률](legal/REGISTRY_PUBLIC_DATA_AND_API_20261101.md), [중개업 기능별 분석](legal/BROKERAGE_CLASSIFICATION_20261101.md).

### 판정 게이트와 남은 일
- 이 문단은 **코드 작성 기록**이며 아직 배포/법률 검증 완료를 뜻하지 않는다. 해당 브랜치 CI와 PR/main 병합 결과를 후속 검증 기록으로 추가해야 한다.
- 본인확인기관 계약·실 등기 API 공급계약·실 사용자 법률 실사, 실제 2인 거래 QA는 미완료. 운영 환경의 모델/개인정보 관련 약관·보관/파기 및 현재 P5 PR #21의 충돌·병합 여부도 별도 관리한다.

### 2026-11-01 · 후속 진행 정정 및 P5 병합
- PR #21 (`feat/owner-hub-bulk-p5-20261101`): 병합 전 head `fbf8025`에서 GitHub verify-fast **PASS**, verify-e2e **PASS**, mergeable 상태 확인 후 `main@44ef644`로 **squash 병합 완료**. 기존 개발로그의 '오픈, 미병합'은 병합 이전 시점의 기록이다.
- PR #24(P7): 초기 CI에서 `Array.entries()`가 이전 TypeScript target/downlevelIteration 설정과 충돌해 빌드 실패 → 인덱스 루프로 변경. 다음 CI 단위 검증에서 '이용자가 체크한 항목은 공적 검증이 아님' 경고 문구 누락을 잡아 설명을 추가함. 이력과 CI 링크는 PR #24에서 유지.

### 2026-11-01 · P7 확정 병합 기록

- **PR #24**: [권리관계 구조화 분석 + 집톡이 중립 절차 지원](https://github.com/hobism3/meta_p2p_realestate/pull/24). Head `7630d329`에서 GitHub `verify-fast` **SUCCESS** (Next 빌드, Node unit·DAL, API/READ_ONLY regression); **main squash merge `ec08853ed`**.
- **검증 중 발견한 결함**: 첫 빌드에서 ES5/downlevelIteration과 `Array.entries()` 비호환 → 인덱스 반복으로 수정. 첫 단위 검증 247 PASS/1 FAIL에서 '자기 체크는 공식 인증이 아님' 경고 누락 발견 → 문구 추가 후 전체 fast 성공. 실패 이력을 삭제하거나 테스트 기대치를 완화하지 않음.
- 사용자 2계정 실제 거래 검증, 외부 등기 API 실제 호출, 법무 승인, 본인확인기관 B/매물 권한 C 실제 인증은 **미검증**. `verify-e2e`의 PR 최신 커밋 결과는 병합 당시 **실행 중(최종 결과 미확인)**이었으며 정식 출시 게이트로 판정하지 않음.
- **Production 배포 SHA/환경 검증은 수행하지 않음**: `main` 코드 병합과 Production 운영 반영을 혼동하지 않는다.
- 개발 방향 보전: 안전등급/채권최고액을 실제 대출로 계산하지 않는 구조화 권리점검 + 대화 중간 안내/남은 조건 확인만 수행하는 집톡이; 실사용자 거래와 법률 실사는 사용자 요청에 따라 후속으로 미룸.
- 후속 구현 과제 후보: 로컬 검토 내용의 사용자 선택형 저장·복구(서버 PII 저장 없이), 등기 API 공급계약 후 비동기 결과/원본 발급시점 어댑터, 신원(B)과 권한(C)의 상호 검증, 집톡이 근거/확인 처리 동선, 관리자 허위매물 처리 프로세스.

### 2026-11-01 · P7 E2E 최종 결과 후속 확인
- PR #24 최종 코드 커밋 `7630d329`의 GitHub `verify-e2e`가 **completed / SUCCESS**로 끝난 것을 병합 이후 재확인. 동일 커밋 `verify-fast`도 **SUCCESS**. 자동화 테스트는 격리 시연/테스트 환경이며, 사용자가 보류한 실제 2인 거래 QA·실등기 API·법률 승인·Production 배포 검증을 대신하지 않음.
