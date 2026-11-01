# DirectHome 진행 현황 (2026-11-01)

이 파일은 현재 상태만 요약합니다. 과거 실험/업무 기록은 Git history 및 `BACKLOG.md`에 보존됩니다.
**실행 순서와 게이트:** [ROADMAP.md](ROADMAP.md) / [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).

## 기준선
- main `2c3a2a6868c61028d492a0a56cb9d7dd7ea45f1e` (PR #15).
- 완료: 매물 탐색, 집주인 AI 설정·사실 응대·확인함, 방문 예약 승인, 구글/이메일 가입, 시연 집톡이·거래 조건 카드, 운영 DB PostgreSQL.
- 진행: Phase 0 예약 24시간 만료·활성 예약 중복 선점 차단·잘못된 UX 문구 정정.
- 예정: Phase 1 서버 통합 거래 상태 → Phase 2 실거래 집톡이 → Phase 3 집주인 AI 서버 내구성 → Phase 4 운영 허브 → Phase 5 출시 안전 검토.
- **미검증:** 실제 운영 Supabase 계정 두 개를 사용한 사용자 수동 E2E, 법률·소유권 검증, 복구 테스트.

## 정책
- 외부 푸시/네이티브 앱은 보류. 조회·신청 시 서버가 예약 상태를 정리한다.
- AI는 가격 조정/계약/방문을 대신 확정하지 않는다. 사용자 명시 동의만 최종 합의로 판정한다.
- 모든 Phase는 별도 PR·테스트·Preview 체크 뒤 main에 병합하고 검증 결과를 개발 기록에 누적한다.
