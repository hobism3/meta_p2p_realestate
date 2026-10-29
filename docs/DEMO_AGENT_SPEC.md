# DEMO_AGENT_SPEC — 시연용 AI 거래 상대방

## 1. 개요

- 거래방에서 사람과 자연스럽게 대화하는 챗봇형 에이전트. 집톡이(중립 도우미)와 별개다.
- 시연 모드(방 단위): 사람 매수자 ↔ AI 매도자 / 사람 매도자 ↔ AI 매수자 / 사람 ↔ 사람(일반).
- VS-2B에서 축소 구현됨: 별도 시나리오 설정 없이 매물 정보로 자동 연결(mock). room_agents 테이블 없이 owner 유무로 시연 판별하고, 메시지 POST 훅으로 사람 1건당 AI 최대 1건을 붙인다. invoke API·room_agents는 VS-2C 이후에 둔다.

## 2. M1-B 기반 위치

- 방: `deal_rooms` + `room_members`. 방마다 모드가 다르다(A-B와 A-C 독립).
- 메시지: `messages` + `author_type`(`human | demo_agent | assistant`, 005 예정).
  서버가 호출 경로로 확정하고 클라이언트 값은 무시한다.
- AI 메시지는 화면에 AI 표시를 의무로 한다. 실제 사용자로 위장 금지.

## 3. 데이터 모델 (005 예정)

- `demo_scenarios(id, listing_id, persona, facts_json, negotiable_json)`:
  합성 매물·시나리오 정보. 가격·입주일·집 상태와 협상 가능 범위를 JSON으로 둔다.
  시나리오에 없는 사실은 답변하지 않는다.
- `room_agents(room_id, side, scenario_id, disclosure_label)`:
  방마다 AI 측(side: seller | buyer)과 시나리오를 묶는다. 1:1이므로 방당 최대 1개.
- `agent_runs(id, room_id, agent_type, trigger, prompt_version, provider, summary, created_at)`:
  역할별 실행 로그. demo_agent와 assistant를 분리 기록한다. provider(mock|real) 필수 기록.
- 매매 시나리오는 M1-C의 매매가격 필드가 필요하다. M1-C 전에는 월세·전세 시나리오만 둔다.

## 4. 상태 흐름

- 방 생성 시 모드 확정: 사람 측이 문의하면 상대 측에 AI 배정(시연 모드일 때만).
- 사람 메시지 1건 → AI 응답 최대 1건. AI가 쓴 메시지에는 AI가 반응하지 않는다.
- AI끼리 무한 호출 금지: 트리거는 human 작성 + 사용자 명시 요청 + 중요 이벤트(충돌·조건 변경)로 한정한다.
- 중요 조건(가격·입주일·소유권)은 AI가 자동 확정하지 않는다. 시연용 제안은 가능 범위 안에서만 하고 확정 API는 두지 않는다.

## 5. 행동 규칙

- 합성 시나리오의 정보만 사용한다. 없는 사실을 만들어내지 않는다.
- 실제 소유권을 보장하지 않는다. 보장 문구 금지.
- 협상 가능 범위 안에서는 시연용 제안을 할 수 있다. 범위를 벗어나면 사람 확인을 요청한다.
- 집톡이와 역할 분리: 데모 에이전트는 거래 당사자 연기, 집톡이는 중립 정리. 한 메시지가 두 역할을 겸하지 않는다.

## 6. API 스케치 (신설 예정, M1-B 라우트 재사용 아님)

- `POST /api/rooms/[rid]/agent/invoke` — 사람 메시지 수신 후 AI 응답 1건 생성. 멤버 + 시연 모드에서만.
- `GET /api/rooms/[rid]/agent/status` — 모드·시나리오·disclosure 상태 조회.
- 공통 가드: `guardWrite` + 인증 + 방 멤버. AI 응답 저장 시 `author_type=demo_agent` 강제.

## 7. 기술 원칙

- `room_id` 기반 이력 격리. 프롬프트에 다른 방 이력을 넣지 않는다.
- 역할별 프롬프트·상태·실행 로그 분리(demo_agent vs assistant).
- 실제 Muse API 호출과 mock 구분. mock 기본, 실제 호출은 환경변수 + 명시 플래그.
- 중요 조건 자동 확정 금지(확정 API 없음).
- VS-2C: 실행은 Agent Service로 단일화. 사람 저장과 AI 생성을 분리하고 DB 유일키로 중복을 막는다. mock 기본, meta는 키 + 명시 설정 때만. 실패는 mock으로 속이지 않는다.

## 8. 검증 시나리오 (구현 후)

1. A-B방 AI 응답이 A-C방에 노출·혼입되지 않음.
2. 클라이언트가 `author_type=human`으로 위장한 AI 행 저장 시 거부.
3. AI 메시지 연속 게시에도 추가 AI 호출 없음(루프 가드).
4. AI 메시지에 AI 표시 존재.
5. 범위 밖 제안 시 사람 확인 요청 문구 존재, 자동 확정 없음.
6. provider 로그에 mock/real 구분 기록.
7. 운영 DB 미사용(격리 sqlite), 합성 시나리오만 사용.

## 9. 구현 단위 (백로그 등록)

- AI-1: 005 마이그레이션 + 적용 테스트(sqlite·pg-mem).
- AI-2: author_type 서버 강제 + 위조 거부 테스트.
- AI-3: mock provider + 시나리오 기반 응답 단위 테스트.
- AI-4: invoke API + 루프 가드 테스트.
- AI-5: 집톡이 추출·분류·충돌 mock 테스트.
- AI-6: 집톡이 카드 UI 틀(mock 데이터).
- AI-7: 실제 Muse 연동(키 확보 후 수동 검증).
- AI-8: 시연 E2E(방 격리·표시·미확정 확인).
