# DirectHome P1 — 실거래 거래 상태 통합 / 두 사람의 확인 카드
2026-11-01 / 기준선 main `a874a9a` (P0 PR #16 이후)

## 핵심 문제
현 구현은 실제 방문 예약 `owner_visit_bookings`와 집톡이 시연용 `visits` 및
합의 제안 `room_proposals`, 대화 추출 `room_conditions`가 서로 분리되어 있다.
실제 예약이 완료돼도 거래 단계에 반영되지 않고,
집주인의 구두 허용과 양측 공식 확인을 같은 의미로 표시할 위험이 있었다.

## 이번 PR의 목표
- `GET /api/rooms/{rid}/transaction-state`로 6개 거래 단계의 canonical read-only projection 제공.
- 방 멤버 JWT 인증 필수. Owner AI/집톡이 임의 추론이 확정 상태를 직접 변경하지 않는다.
- **실거래 방문:** `owner_visit_bookings.status='confirmed'`인 경우만 완료.
  `requested`는 집주인 승인 대기, `cancelled/expired/declined`는 미완료.
  실거래에 과거 시연 방문 `visits` 수락 기록을 혼합하지 않는다.
- **금액/계약/옵션:** `room_proposals.status='agreed'`만 confirmed. 이 상태는
  `proposal_approvals`의 양측 동의 규칙을 통과한 서버 상태이다.
  `room_conditions`·대화 발언은 discussing/pending 후보로만 표시한다.
- **기존 확정 조건에 새 제안이 온 경우:** 기존 confirmedValue 보존,
  pendingValue와 '동의 대기'를 별도로 보여준다. 이전 동의를 재활용하지 않는다.
- **생활 조건:** 고양이 허용 발화만으로 생활 조건 전체 완료 아님.
  옵션·관리비·수리 요청이 한 개 이상 합의되면 '일부 확인'으로만 표시.
- **잔금·인도:** 잔금일과 인도/입주일 모두 양측 확정이어야 완료.
- **시연 방:** 기존 `visits` 결과를 별도 시연 동의로 표기.
- **UI:** 실제 거래방에서 6단계 상태·다음 확인·근거 링크와
  두 사람의 수동 확인 카드 생성·동의·거절을 제공.
  'AI 집톡이가 실제 방에서 대화를 이끄는 기능'은 Stage 2로 분리한다.

## 상태 계약
`TransactionStage = {key,label,status,confirmedValue,pendingValue,detail,evidence,...}`
`status`: confirmed / partial / pending / discussing / not-started.
`confirmedValue`는 공식 동의·집주인 승인 기록이 존재하는 값만 포함.
`pendingValue`는 아직 양측이 확인하지 않은 값으로 명시한다.
`nextStep`은 누락된 단계를 사용자에게 안내할 힌트이며, 계약 권한을 생성하지 않는다.

## 제약과 품질 게이트
- 실거래방에 제안카드가 생겨도 가격을 자동 절충·승낙하거나 방문을 예약하지 않는다.
- 기존 조건·예약 DB 스키마 변경 없음. 모든 변경은 별도 카드/상태 API에서 인증 후 수행.
- 방 외부 제3자의 조회는 403, 로그인하지 않으면 401.
- PC/모바일 양측 카드 확인 E2E; visitor 단독 동의 후 미확정,
  owner 동의 후 완료; 반려동물 언급만으론 미확정; 실제 예약 승인만 방문 완료.
- 개인정보·계약서 원본 생성/금전 지급은 비범위.
- 보류: 서버 측 실거래 집톡이 개입, 메시지별 자동 제안 생성, 예약·조건 이벤트 스트림,
  거래 유형별 법률 안내 검증.
