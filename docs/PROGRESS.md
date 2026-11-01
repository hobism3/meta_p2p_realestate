# DirectHome 현황 — 2026-11-01
최신 개발 방향과 완료 판정: [활성 로드맵](ROADMAP.md) · [누적 개발 기록](DEVELOPMENT_LOG.md).

## 출시 기준선
- `main`: `fd05290752be169f83be3ecc150a6d0f89bfaef2` (PR #18 실거래 집톡이 병합).
- 기본: 지도·매물 검색, 집주인 관리, AI 대리 응대, 이메일/Google 가입, 예약 요청·승인·취소, 시연 집톡이 조건 카드.
- P0: 미승인 방문 요청 24시간 lazy 만료, 슬롯 반환, 동일 방문자 활성 예약 제한, SQLite 트랜잭션 직렬화. CI 확인 후 main 병합, 프로덕션 READY.
- P1: 거래 단계 정형 상태·실거래 2인 확인 카드·실제 방문 승인 반영 완료 (PR #17, CI 검증·main 병합·Production READY).
- P2 실거래 집톡이: [PR #18](https://github.com/hobism3/meta_p2p_realestate/pull/18)에서 구현·검증. 실제 그룹채팅 참여, 조건 자동 확인 카드, 집주인 AI 사전 정책의 반려동물 확인, 방문 승인/양측 동의 후속 안내, 중복 이벤트 방지. 협상·임의 동의 금지. 최종 main 병합 상태는 PR 참조.
- 운영 Supabase 실 사용자 2계정 수동 E2E, 소유권 인증, 개인정보·법률 자문, 장애 복구는 아직 완료되지 않음.
- 웹 우선, 앱·외부 알림은 보류.

## 작업 방식
기능별 브랜치 → 문서/테스트 → Next build → API/Playwright → GitHub CI → Preview → main.
기존 방·합의·예약 기록을 보존하고, 명시적 양측 동의/소유자 승인이 없는 상태는 절대 확정하지 않는다.

## Stage 3 개발
- [집주인 AI 내구 작업 원장](OWNER_AI_P3_DURABLE_QUEUE_20261101.md) 구현 진행. `main` 병합/Production 완료 전까지 기능은 브랜치에서만 확인할 것.
