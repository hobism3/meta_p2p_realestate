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
- [ ] Playwright 전체 18개(desktop·mobile) — 결과 확인 후 최종 판정.
  - 기실행 18건 전패(원인 확정): 실행기 기본 경로(`%LOCALAPPDATA%\ms-playwright`)에
    `chromium_headless_shell-1248` 없음. `test-results/*/error-context.md` 18건 모두
    `browserType.launch: Executable doesn't exist` 동일 오류. 코드·서버 문제가 아님.
    미조치 프로세스 없음(node 0건, chrome은 사용자 브라우저만, 종료하지 않음).
  - 지도 desktop 3건 PASS 확인(`--grep "지도" --workers=1`, 실Chromium):
    지도형 전환·마커 클릭·리스트→상세 연동 `3 passed (1.5m)`.
    단 종료 코드 1 — 테스트가 global-timeout 90초를 다 써서 teardown 단계가
    타임아웃된 레이스이며 테스트 실패가 아님. 재실행 시 global-timeout 상향 필요.
  - 잔여: mobile 지도·넘침, desktop 넘침·등록·거래방은 `PLAYWRIGHT_BROWSERS_PATH=
    web/.playwright-browsers` 지정 후 작은 단위로 실행해야 함. 18건 일괄 재실행 금지.
- [ ] 자격증명 교체: 워크트리·히스토리 키워드 검사 무노출. 운영 대시보드 교체 여부는 사용자 확인 필요.
- [ ] main 병합 + READ_ONLY=true 운영 적용은 승인 후 (절차 준비됨, 미실행).

## P3 사용자 인증·DB·다중 사용자 거래방 — DONE(부분)

- [x] 서버 DB + DAL 이중 지원 + 외래키 + 버전관리.
- [x] dev 별명 + Supabase JWT 검증 코드. 실연동은 계정 설정만 남음.
- [x] 거래방 서버 공유. author·role 구분.
- [ ] Supabase Auth 로그인 UI. BLOCKED 아님, TODO.

## P4 집톡이 AI 구현 — TODO

- [x] 스펙(`AI_CHAT_ASSISTANT_SPEC.md`).
- [ ] 조건 초안 API + UI 틀.
- [ ] Muse Spark 프록시 + 합성 대화 테스트.

## P5 독립 검증·보안 — DONE(반복)

- [x] 감사 4회 + 재검증 2회. 수용 위험 3건 기록(토큰 노출·근사 rate limit·실브라우저 미확인).

## P6 해커톤 제출 — TODO

- [ ] 제출물·발표자료.
