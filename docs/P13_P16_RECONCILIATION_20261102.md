# P13–P16 통합 상태 재점검과 출시 분리 (2026-11-02)

## 상황
사용자가 P13~P16을 순차 수행하도록 요청했으나 확인 시 다른 작업 흐름에서 **이미 4단계 기능이 모두 main에 병합**돼 있었다. 이 문서는 동일 기능을 다시 작성하지 않고 GitHub PR/실제 파일/배포를 조회한 결과를 기록한다.

## Git 기준 사실
- PR #25 사진 AI: merged. 사진 옵션 후보, 누락 공간 촬영 안내, 수동 가림, 선택형 AI 가구 제거(별도 동의). **실유료 Meta 호출/출력 품질 확인 없음**.
- PR #34(P13) merged, main `84130cea`: 등기 PDF와 별개로 소유자만 게시/삭제 가능한 JPEG 파생본 6장/매물 갤러리, EXIF 제한, 매물 카드/상세 연결. **PoC는 DB에 Base64를 저장**하며 실제 운영용 Supabase Storage 비공개 객체 저장 구현이 아님. 기존 Issue #28은 여전히 OPEN.
- PR #35(P14) merged, main `4592e4e`: 게시자 선택/동의한 구조화 권리만 공개. 원본 PDF는 로컬. 권리 현행·말소 상태는 `unknown` 유지, 공식 확인 아님.
- PR #36(P15) merged, main `997c26b`: 집톡이 4단계 중립 절차 카드(방문·양측 조건·등기 확인·계약 준비), AI 자동 계약/가격 절충/소유권 승격 없음.
- PR #37(P16) merged, main `6f3643e`: 공개 `/showcase`에서 사용자 시연 흐름과 근거 링크; 안내 페이지 자체 Meta 유료 호출 0.
- 마지막 읽은 main `ae5e441`: 로그인 후 등록 화면 복귀 처리 등 추가 변경. `docs/ROADMAP.md`는 이전 P12 기준에 머물러 있어 이번 갱신으로 기능 상태를 일치시킴.
- 2026-11-02 확인한 GitHub에서 open PR **0건**. P13~P16을 또 구현해 중복 비용을 만드는 대신 현 구현에 대한 검증과 후속 출시 게이트로 전환.

## 자동 테스트와 배포 — 무엇을 확인하지 못했나
- 사진 PR #25의 head `d994b780`에서 GitHub `verify-fast`/`verify-e2e` 둘 다 성공. Preview READY `d994b780` 확인.
- **main 최종 HEAD `ae5e441`의 GitHub Actions 실행 결과는 해당 SHA로 조회 시 0건**, P13~P16 개별 PR 병합·README에서 기록한 테스트를 최신 통합 HEAD의 새 검증으로 간주하지 않음.
- Vercel `target=production` 조회에서 P12 기준 `bf33ee1` READY 배포를 확인. 이는 과거 Issue #30의 P10 시점 구버전 SHA 상태는 해소됐다는 증거지만 **P13~P16 또는 `ae5e441`이 Production에 배포됐다는 증거는 아님**.
- Vercel 새 배포·Promotion·Rollback은 요청 없이는 하지 않음. 최신 SHA와 PDF worker 같은 도메인 파일/권한/화면 검증은 Issue #30에서 추적.

## 사용자가 보류한 것
- 실제 서로 다른 두 Supabase 계정으로 하는 거래 시연/승인 QA: 보류.
- 계약·중개업/광고·본인인증 B 및 소유·임대 권한 C의 실제 법적 검증/법무 승인: 보류.
- 등기부 권리 파싱 결과 법적 유효성, 선순위·세금·말소선, OCR 정확도: 검증 한계 유지.
- 사진의 실제 Meta 모델 분석과 개인정보 전송·운영 비용·사진 진위: 합성/Mock과 구별.

## 다음 작업(중복 방지)
1. **P16 사용자 시연 완결성 확인**: /showcase → 역할/매물 → 등록/사진/AI → 권리정보 → 중립 4단계 흐름에서 끊기는 링크·로그인 복귀·모바일 동선 수정. 실거래 E2E는 보류.
2. **P13 운영 저장 전환 여부 결정**: POC 수준은 6장 DB JPEG 유지. 실사용 준비 때만 Issue #28에서 Supabase Storage/보존·삭제·접근통제·원본과 AI 생성물 분리를 구현.
3. **배포 정합성**: 최신 main READY 여부와 same-origin PDF worker·기본 공개 URL 응답, 무료/Mock 대체 상태를 확인해 Issue #30 해결 여부 판정.
4. **제출 품질**: 데모 가이드/README에 구현 vs 실제 모델/법적 미검증을 구분하고 해커톤 시나리오가 실행 가능한 상태인지 검증.
5. **비용 게이트**: 남은 Meta $15 예산을 고려해 자동 실모델 호출·무제한 retry 금지. 우선 Mock/합성 테스트.

문서 근거: `docs/P13_PHOTO_GALLERY_20261102.md`, `docs/P14_REGISTRY_LISTING_BRIEF_20261102.md`, `docs/P15_TRANSACTION_JOURNEY_20261102.md`, `docs/P16_HACKATHON_SHOWCASE_20261102.md`; GitHub PR #25, #34~#37 및 Issue #28, #30.
