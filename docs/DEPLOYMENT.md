# 배포 runbook

## 전제

- GitHub main에 푸시됨. Vercel이 자동 재배포.
- Supabase 프로젝트 존재. 상세는 `docs/HOSTING_PLAN.md`.

## 환경변수(Vercel Production)

- `DATABASE_URL`: 6543 풀링 주소. 비번 URL 인코딩 확인.
- `SUPABASE_JWT_SECRET`: Auth 로그인용.
- `WRITE_TOKEN` + `NEXT_PUBLIC_WRITE_TOKEN`: 같은 값. 남용 방지용.
- `RATE_LIMIT_PER_MIN`: 기본 120.

## 배포 확인

1. `/api/health`가 `{"ok":true,"db":"up"}`인지 본다.
2. `down`이면 DATABASE_URL을 본다. 없는지, 틀렸는지, Preview 전용인지.
3. `/api/listings`가 200인지 본다.

## 알려진 함정

- SSL 미설정 → 500 전멸. 코드는 이미 반영됨.
- 마이그레이션은 첫 DB 접근 때 자동. 손 SQL 불필요.
- 환경변수 변경 후 Redeploy 필수.
