# 집톡이 Meta Muse Spark 출력 길이 초과 복구

날짜: 2026-10-30
범위: /api/rooms/:rid/ziptalk/invoke 및 관련 서버·클라이언트 코드

## 현상과 원인

사용자가 AI 임대인과 대화한 뒤 집톡이 분석 시 Chat Completions가 HTTP 200이지만,
choices[0].finish_reason=length / message.content=null 형태로 끝났다.
완료 토큰 예산이 부족해 유효한 JSON 분석 결과가 생성되지 않은 것이다.
기존 처리에서는 이를 502로 반환하고 내부 응답 구조까지 사용자에게 노출했다.

## 변경

- Meta 전송 계층에서 finish_reason=length를 truncated로 분류. 부분 문자열도 성공 처리 금지.
- 집톡이 요청의 대화 이력을 8건으로 제한하고 JSON 출력 예산을 1536토큰으로 조정.
- 한 요청에서 Meta 유료 호출은 최대 1회. 길이 초과 시 근거 기반 규칙 분석으로 대체.
- 대체 경로를 provider=mock, model=ziptalk-v1, fallback=meta_truncated로 DB·API·UI에 명시.
- 실패 시 내부 응답 키/부분 내용 노출을 제거하고 사용자 친화적 오류 출력.
- 제안 카드만 새로 생성된 경우에도 agent_runs.status=done으로 마무리하도록 수정.

## 검증

- tests/agent.test.mjs: length+null, length+부분 문자열, stop+null 분류.
- tests/ziptalk-meta-recovery.test.mjs: 가상 Meta HTTP 응답으로 분석 성공·조건 저장·재호출 멱등·오류 비노출 확인.
- 기존 집톡이/거래방 회귀 테스트를 실행하고 CI 결과를 확인한다.
- 실제 사용자 대화/운영 DB 변경 없음. 실제 유료 Meta 호출 없음.

## 운영상 한계

기본 분석은 정규식 기반이며 자유로운 대화 전체를 이해하지는 못한다.
모든 조건은 거래 현황에서 사용자 검토가 필요하다.
timeout, HTTP 429/401, 모델 거절 및 일반 형식 오류를 성공으로 위장하지 않는다.
실제 Meta 환경의 출력 분포/비용은 별도 운영 계측 대상으로 남긴다.
