# 품질 게이트

## 상태 규칙

- IMPLEMENTED: 코드만 있음. 완료가 아니다.
- DONE: 아래 게이트를 전부 통과해야 한다.

## 공통 게이트

1. `next build` 통과.
2. `node --test tests/` 전부 통과. 실패 숨김 금지.
3. 신규·변경 API는 통합 테스트에 케이스 추가.
4. 스모크: 페이지·API 200 확인(로컬 또는 운영).
5. 문서·백로그·로그 갱신.

## 마일스톤 추가 게이트

- DB 변경: 마이그레이션 파일 + 신구 DB 모두에서 테스트.
- 인증 변경: dev·토큰 모드 둘 다 테스트.
- 배포 변경: 운영 health의 `db`가 `up`인지 외부 확인.
- 보안 변경: 별도 브랜치에서 구현·테스트. main 병합은 승인 후.
- E2E: Playwright 데스크톱·모바일 둘 다 통과. 워커 간 데이터 격리 필수.
- E2E 실행은 `--workers=1` 직렬 + 테스트 전용 DB(pid별 sqlite·`data/e2e.db`). 운영 DB 대상 등록·메시지 E2E 금지.
- Playwright 브라우저 경로는 프로젝트 내 벤더링(`web/.playwright-browsers`)으로 고정. 전역 timeout과 webServer 기동·종료 시간을 분리한다(전역 예산 고갈 시 teardown이 잘려 종료코드 1이 된다).
- CI: PR·브랜치 push 시 `verify-fast`(build·단위·API·보안)와 `verify-e2e`(격리 Playwright·실패 trace) 통과. 운영 DB·운영 비밀키 사용 금지. CI 미실행·실패 상태에서 병합·배포 금지. E2E 환경 실패는 성공으로 처리하지 않고 별도 BLOCKED로 기록.
- 인증 변경: dev 별명 인증은 `ALLOW_DEV_AUTH=true` 명시 시에만. 운영에서 secret·플래그 없이 쓰기가 열리면 게이트 실패.
- 보안 변경: READ_ONLY 회귀(`tests/readonly.test.mjs` 쓰기 403·조회 200) 통과 없이 main 병합 금지.
