# 집톡이(중립 거래 정리 도우미) 스펙 — M1-B 기반 개정

## 1. 개요

- 집톡이는 거래방의 중립적 도우미다. AI 거래 상대방(DEMO_AGENT_SPEC)과 별개다.
- 역할은 대화 정리와 미확인 안내. 협상·판단·확정은 하지 않는다.
- 캐릭터 표기: 거래 정리 도우미. AI 공인중개사라는 표현 금지.
- 이 문서는 설계만 다룬다. 코드 구현 없음.

## 2. M1-B 거래방 구조 (구 §2 전면 교체)

구 스펙 §2는 localStorage 시절 분석으로 폐기한다. 현재 구조:

- `deal_rooms(id, listing_id, created_by, created_at)` + `room_members(room_id, user_id, role)`.
- `messages(id, listing_id, author, role, user_id, room_id, text, created_at)`.
  `room_id IS NULL`이면 공용 스레드, 값이 있으면 개인방이다.
- `condition_drafts(field, value_text, source_msg_ids_json, status, version)`,
  `confirmations(condition_id, landlord, tenant)`가 이미 서버 DB에 있다.
- 집톡이의 읽기 단위는 `room_id`다. 방을 벗어난 이력 참조 금지.

## 3. 작성자 유형 (신규, 005 예정)

- `messages.author_type`: `human | demo_agent | assistant`. 서버가 확정한다.
  클라이언트 입력값은 무시하고, 인증 신원·호출 경로로만 정한다.
- 집톡이 메시지는 `author_type=assistant` + 화면에 AI 표시. 사람으로 위장 금지.
- 위조 방지: human 행세를 하는 assistant/demo_agent 행은 400으로 거부한다.

## 4. 집톡이 UI 위치 (구 §3 유지 + 방 스코프)

- 거래방 상단: 집톡이 요약 카드(해당 `room_id`의 최신 조건 초안 + 미확인 건수).
- 메시지 영역: AI 말풍선. 사용자 요청 또는 중요 이벤트(충돌·조건 변경)에서만 등장. 도배 금지.
- 합의 로그 옆: 조건별 확인 상태. 확인 체크는 사람이 직접 누른다.
- 체크리스트 옆: 미확인 사항 연결. AI 안내는 문구만.
- 공통 문구: 초안이며 자동 합의가 아니다. 법적 안전·효력을 보장하지 않는다.

## 5. 조건 추출 데이터 모델 (구 §4·§5 유지, 방 스코프 명시)

- ConditionDraft: `{ id, field, value, sourceMsgIds, confidence, status, version, createdAt }`
  + `room_id`. 방마다 독립 버전 이력. 이전 버전 삭제 금지.
- 분류: 제안·질문·희망·철회를 구분한다. 철회는 조건 삭제가 아니라 상태 전이로 기록한다.
- ChangeEvent `{ conditionId, oldValue, newValue, msgId }`,
  Conflict `{ field, sideA, sideB, msgRefs }` — 모두 같은 `room_id` 안에서만 탐지한다.
- Confirmation `{ conditionId, landlord, tenant }`에 더해 **확인 주체 구분**:
  실제 사람 확인과 AI 상대방의 시연용 확인을 같은 값으로 저장하지 않는다.
  시연용 확인은 합의로 집계하지 않는다.
- 중요 조건(가격·입주일·소유권 관련)은 AI가 자동 확정하지 않는다. 확정 API 자체를 두지 않는다.

## 6. Muse Spark 연동 방식 (구 §6 유지 + provider 분리)

- 호출은 서버에서만 한다. 키를 클라이언트에 두지 않는다.
- provider 인터페이스로 실제 호출과 mock을 구분한다. 로그에 provider를 기록한다.
  mock이 기본값. 실제 호출은 환경변수 + 명시 플래그가 둘 다 있을 때만.
- 입력: 해당 `room_id`의 마스킹 대화·합의 로그와 매물 정보. 개인정보·주민번호 제거.
- 출력: ConditionDraft JSON과 미확인 목록. 정해진 스키마만 받는다.
- 금지 출력: 등급, 판단, 특약 문구, 법률 해석. 모르는 것은 미확인으로 둔다.

## 7. 테스트 설계 (구 §8 유지 + 격리 케이스)

- 시나리오 4종(정상 합의·조건 변경·양측 충돌·미확인 잔류) + 격리 3종:
  방A 추출이 방B에 섞이지 않음 / author 위조 거부 / AI 메시지에는 후속 AI 호출 없음.
- API 없이 실행 가능한 mock 테스트를 먼저 둔다. 실제 API 테스트는 키 확보 후.
- 테스트 데이터는 전부 합성 표시한다.

## 8. 법률 추가 검토 사항 (구 §9 유지)

- 명칭·문구가 중개·법률 전문가로 오인되지 않는지.
- AI 요약이 묵시적 합의 증거로 쓰일 위험. 초안·미확정 문구 상시 표시.
- 오추출 손해 책임 고지. 대화 저장·AI 전달 양측 고지·동의 절차.
- 상태: 전부 미확인. 자문 전에는 문구·동작을 보수적으로 둔다.

## 9. 구현 범위 (구 §10 교체)

1. 005 마이그레이션: `author_type` + 집톡이 읽기 전용 접근(스키마 변경 없음이면 생략 가능).
2. author_type 서버 강제 + 위조 거부 테스트.
3. mock provider 기반 추출·분류·충돌 테스트.
4. 요청·이벤트 등장 + 조건 카드 UI 틀(mock 데이터).
5. 실제 Muse 연동(키 확보 후, 수동 검증).
