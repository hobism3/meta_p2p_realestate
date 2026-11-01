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
- **상태: 개발 중** (`feat/transaction-state-p1-20261101`).
- 설계: `docs/TRANSACTION_STATE_P1_20261101.md`.
- 구현 범위: read-only room transaction projection, 6개 단계의 근거·확정·제안 상태, 실제 방 수동 카드 양측 승인 UI.
- 완료 후 실제 테스트 수치/CI/Preview 및 병합 SHA를 추가한다.
- Stage 2는 실거래 집톡이 자동 개입·진행 안내. Stage 1 projection은 판단 기준선으로 재사용한다.
