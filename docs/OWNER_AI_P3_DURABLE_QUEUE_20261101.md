# DirectHome Stage 3 — Owner AI Durable Queue / 운영 설계
2026-11-01 · `feat/owner-delegate-durable-p3-20261101`

## 0. 목표와 완료 판정
- **브라우저 후속 호출 제거**: `POST /api/rooms/{rid}/messages` 시 인간 메시지와 AI 응대 작업을 **한 DB 트랜잭션**으로 저장한다. 방문자가 페이지를 떠나도 기록된 작업은 유실되지 않는다.
- **즉시 처리 + 장애 복구**: POST 완료 전에 서버에서 짧은 규칙 기반 응대를 우선 수행한다. 실패하면 작업 상태를 기록하고 서버 cron에서 재시도한다.
- **운영 정책 준수**: 집주인 등록 설정으로 답변하는 **규칙 기반 AI 대리인**만 대상. 변경 금액/계약/개별 방문 예약은 대신 승인하지 않고 `owner_ai_requests`에 사람이 답할 항목으로 남긴다.
- 실제 메타 LLM 비용 추가 없음. 집톡이/예약/양측 카드 합의의 진리 원천은 변경하지 않는다.

## 1. 구조
```
authenticated tenant POST message
  ├─ DB TRANSACTION: INSERT messages, INSERT owner_ai_jobs (one per room+trigger)
  ├─ existing real Jiptok guidance (best effort)
  └─ server drain job (best effort)
       ├─ claim (atomic conditional UPDATE RETURNING, expiring lease)
       ├─ recheck room actor / owner AI policy version / enabled flag
       ├─ owner-delegate-service.runOwnerDelegate (unique room+trigger)
       ├─ owner_agent reply OR owner_ai_requests handoff
       └─ completed / disabled / pending(retry) / failed
 Vercel Cron → GET /api/cron/owner-agent (CRON_SECRET only)
       └─ claim pending due or abandoned processing and recover
 Owner /owner: failed job view + explicit 'AI 응대 다시 실행'
```
- 메시지/작업 저장은 원자적이며 처리 실패 시 인간 메시지는 삭제하지 않는다. 처리 중 Function이 종료돼도 만료된 lease를 Cron에서 회수한다.
- `owner_ai_jobs`: `UNIQUE(room_id,trigger_msg_id)`, `status`, `attempts`, `available_at`, `lease_until`, `reply_msg_id`, `policy_updated_at`, `last_error`.
- **5회 재시도 예산** + 지수 backoff(첫 15초, 이후 30/60/120초 등). 5회 후 failed, 집주인 계정에서만 조회/재시도 가능. 기록된 문장은 최대한 익명화된 오류 상태만 표시, 실패 원문 공개 금지.
- DB claim은 원자적 `UPDATE ... WHERE status/due ... RETURNING`으로 중복 실행을 방지. 재처리 시 `owner_ai_runs`의 고유키로 답변 중복 방지.
- **정책 버전 변경 처리**: enqueue 때 설정 updated_at 기록, 실행 때 비교. 변경·비활성화된 정책으로 늦게 답하는 것을 중단(disabled)하며, 이미 보낸 메시지는 삭제하지 않는다.
- 시연방, 원래 시연 에이전트 시나리오가 있는 방, 집주인 자신의 메시지, AI가 쓴 메시지에는 작업을 만들지 않는다.
- 기존 `/owner-agent/invoke`는 이전 클라이언트 호환을 위해 유지하며, runOwnerDelegate는 기존 멱등키를 사용한다. 새 UI에서는 이 후속 호출을 사용하지 않는다.
- **이전 클라이언트의 수동 invoke 경로도** queued(202)/failed(409)/disabled(200) 상태와 정책 버전을 확인한다. 재시도 제한 우회 금지. completed만 기존 응답 반환. 기존 큐 생성 이전 메시지의 호환 수동 처리는 허용.

## 2. 권한/운영
- Cron API: `Authorization: Bearer ${CRON_SECRET}`을 일정 시간 검사한다. 설정이 없으면 503(실패 폐쇄), 키가 틀리면 401. 일반 JWT나 `WRITE_TOKEN`으로 접근할 수 없다.
- `/api/rooms/{rid}/owner-agent/jobs`: **room member**만 작업 상태 조회. raw stacktrace·환경키·입력 원문 반환하지 않는다.
- `/api/owner/ai-jobs`와 `/api/owner/ai-jobs/{jid}/retry`: **custom_listings.owner_id**로 소유자 확인. 타인은 목록이 비고 재시도는 404.
- Vercel `web/vercel.json` Cron: **매일 00:00 UTC 1회**, Hobby 호환. 정상 요청의 즉시 서버 처리와 별도이며, 장애·배포 중 중단된 작업의 백업 복구 역할. **무료 플랜에서는 Cron 장애 복구가 최대 하루 이상 지연될 수 있으므로 '실시간 보장' 기능이 아님.** 빠른 복구 SLA가 필요하면 Pro/외부 워커 등으로 별도 설계해야 한다.
- 반드시 `CRON_SECRET`을 Production에 암호화된 환경변수로 설정한다. 임의 외부 호출로 Cron이 실행되지 않게 하기 위함.
- Preview에서는 `DATABASE_URL`이 존재해도 SQLite /tmp 격리. Cron은 Production에서 실행된다.
- 외부 모바일 푸시/SMS·메일 전송 기능은 포함하지 않음. 집주인 로그인 후 웹 확인함에서 수동 확인/재실행 가능.

## 3. QA / Gate
- 신규 SQLite API 통합: 인간 메시지+job 원자성, 자동 owner-agent 응대, 수동 /invoke 이중 호출 멱등성, 가격 변경의 owner inbox 전파, Cron 인증, backoff·실패 5회·집주인 재시도, 만료 lease recovery, 비활성 설정과 정책 버전 불일치 시 미응답.
- 기존 P0~P2 전체 단위·API, 시연 에이전트 별도 격리, Playwright desktop/mobile, GitHub verify-fast/e2e 성공 후 main 병합.
- Prod 배포 전 Vercel CRON_SECRET 연결 및 실제 Vercel cron 프로젝트 등록 확인(설정 페이지). Preview READY 확인.

## 4. 범위 밖
- 브라우저 종료 **이전 요청 자체가 서버에 도달하지 않았을 경우**까지 자동 저장할 수는 없다. HTTP 201 수신 후에는 DB 원장으로 유실 방지.
- AI 모델의 생성 응답이 아닌 기존 사실 기반 규칙. Meta/LLM 제공자 오류·토큰 과금 제어는 별도 프로젝트.
- 외부 알림, 법률 판단/계약 체결·자금 이동, 개인정보 감사·운영 장애 알림, 네이티브 앱은 아직 미구현.

## 2026-11-01 Release Record
- PR #19 squash merge `92c829495db1e708f3024431d3edb25204fbd5a4` → main.
- GitHub verify-fast PASS; verify-e2e 최초 1건 모바일 시연 일정 테스트 타임아웃, 동일 workflow 실패 잡 rerun PASS. 로컬 격리 Chromium desktop/mobile 82 PASS/4 SKIP.
- Next build 및 PostgreSQL 스키마 016 (pg-mem) + SQLite 작업 원장/보안/권한 테스트 PASS.
- Vercel Production READY, health `{\"ok\":true,\"db\":\"up\",\"kind\":\"pg\"}`, 비인증 Cron GET은 HTTP 401.
- Production `CRON_SECRET` 암호화 환경변수 준비 완료. **Cron 일일 첫 실행 기록과 실제 Supabase 사용자 2인 종단 간 수동 시나리오는 미확인**.
