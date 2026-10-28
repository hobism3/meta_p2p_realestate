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

- [ ] 방 분리(room_id) — M1 설계 완료.
- [ ] 참여자 권한 검사 — M1 설계 완료.
- [ ] TLS 검증 활성화(supabase 연결 검증 후).
- [ ] 문서·코드 상태 일치 유지.

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
