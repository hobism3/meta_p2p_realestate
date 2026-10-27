# 호스팅 계획(무료 전제)

## 1. 결정

- 웹 호스팅: Vercel Hobby(무료). Next.js와 궁합이 맞는다.
- DB·인증: Supabase Free(무료 Postgres+Auth). 월세 MVP 규모에 충분.
- 도메인: 초기에는 Vercel 기본 도메인. 커스텀 도메인은 나중.
- 상태: 계획만 확정. 계정 생성·배포는 사용자 몫이다. 이 세션에서 외부 배포 안 함.

## 2. 왜 이 조합인가

- 둘 다 무료枠이 있고 카드 등록 없이 시작 가능하다(정책 변경 가능. 가입 시 확인).
- Next.js API 라우트가 Vercel 서버리스로 그대로 올라간다.
- Supabase는 Postgres라 로컬 스키마와ほぼ 호환된다.

## 3. 로컬과 운영의 DB 대응

- 로컬·테스트: SQLite 파일(`web/data/directhome.db`). 의존성 추가 없음(Node 내장 `node:sqlite`).
- 운영: Supabase Postgres. 스키마는 표준 타입만 써서 이식한다.
- 전환 시 변경점: `DATABASE_URL`을 Supabase接続 문자열로, SQLite 파일을 Postgres 드라이버로 교체.
- 마이그레이션 SQL은 `web/db/migrations.sql` 하나에 둔다. 양쪽에 같은 순서로 적용.

## 4. 비밀키 규칙

- API 키·DB 접속 정보는 코드에 저장하지 않는다. 전부 환경변수.
- 필요 변수: `DATABASE_URL`(운영만), `DB_PATH`(로컬 파일 경로, 기본값 `data/directhome.db`).
- `.env`는 만들지 않는다. Vercel·Supabase 대시보드에서 직접 넣는다.

## 5. 배포 순서(사용자용)

1. Supabase 프로젝트 생성. SQL 에디터에 `migrations.sql` 실행.
2. Vercel에 GitHub 저장소 연결. `meta_p2p_realestate/web`을 루트로 지정.
3. 환경변수 `DATABASE_URL` 등록 후 배포.
4. `/api/health`로 생존 확인.

## 6. 미확정

- Supabase vs Neon 최종 선택(기본값 Supabase).
- 익명+별명 유지를 할지 Supabase Auth를 붙일지. 기본값은 전자로 구현한다.
