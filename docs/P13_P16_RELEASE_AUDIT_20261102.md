# P13–P16 통합 릴리스 감사·개발 로그 (2026-11-02)

## 0. 제품/개발 판정
P13–P16의 **코드 기능은 main에 각 단계 별도 PR로 병합 완료**. 모든 단계의 빠른 CI(Next build + 격리 SQLite/PG DAL + HTTP API 보안 회귀)는 PASS. 합성 데이터와 Mock 모델을 이용한 PoC 기준이며 실제 자격증명·운영 DB·실사용자 계약/법률 검증을 의미하지 않는다.

|Phase|PR|main squash SHA|구현|증거/제한|
|---|---|---|---|---|
|P13|[#25](https://github.com/hobism3/meta_p2p_realestate/pull/25), [#34](https://github.com/hobism3/meta_p2p_realestate/pull/34)|사진 도우미 bb4fe7a; 갤러리 **84130ce**|옵션/빠진 공간 후보, 사진 가림, 게시용 JPEG 소량 DB 저장/소유자 삭제, 매물 목록·상세의 실제 공개 갤러리|[photo docs](P13_PHOTO_GALLERY_20261102.md), 실 이미지 개인정보 제거 성능·운영 스토리지 미검증|
|P14|[#35](https://github.com/hobism3/meta_p2p_realestate/pull/35)|**4592e4e**|브라우저 로컬 PDF→정형 권리 후보→집주인 직접 공개 선택→매물 상세 미검증 안내|[rights docs](P14_REGISTRY_LISTING_BRIEF_20261102.md), 법률상 현행/말소 unknown, 실 소유권 미검증|
|P15|[#36](https://github.com/hobism3/meta_p2p_realestate/pull/36)|**997c26b**|집톡이의 방문/양측 조건/등기·신원/계약 준비 4단계 읽기전용 통합|[journey docs](P15_TRANSACTION_JOURNEY_20261102.md), AI 임의 합의·교섭 없음|
|P16|[#37](https://github.com/hobism3/meta_p2p_realestate/pull/37)|**6f3643e**|/showcase · 실 사용자 기능 링크, 3개 합성 시연 시나리오, 해커톤 심사/근거 기록|[showcase docs](P16_HACKATHON_SHOWCASE_20261102.md), 모델 호출/법률 검증 대체 불가|

## 1. PR별 분리 자동 검증
- P13 #34 head 537493d1, verify-fast SUCCESS: Node/DAL **364/364**, API **218/218**. 첫 실행에서 migration 019 추가로 기존 dal-sqlite.test의 버전 목록 불일치 발생 → 새 마이그레이션 예상 목록을 추가했고, 기존 데이터 보존 테스트는 유지. 전체 Playwright **97 PASS / 4 SKIP / 1 FAIL**.
- P14 #35 head 66fe4cfa, verify-fast SUCCESS: Node/DAL **368/368**, API **222/222**. 첫 실행에서 JSX 삼항식 누락 → 수정; 뒤이어 callback union 타입 및 status verified literal 타입 오류 → 수정 후 빌드 PASS. Playwright **97 PASS / 4 SKIP / 1 FAIL**.
- P15 #36 head f0ff629b, verify-fast SUCCESS: Node/DAL **374/374**, API **222/222**. P14와 verify-fast.yml 원라인 테스트 목록 병합 충돌 발생 → main의 P14 테스트와 P15 신규 테스트를 모두 포함하는 **2부모 병합 commit** 생성 후 CI 빌드/테스트 PASS. Playwright **97 PASS / 4 SKIP / 1 FAIL**.
- P16 #37 head 0e51134e, verify-fast SUCCESS **자체 브랜치 P13 기반** unit **364/364** / API **218/218**. P14·P15 코드는 merge 이후 main에서 통합됐으므로 이 수치를 전체 누적 본체의 통합 PASS로 오인하지 않음. P16 추가 시연 페이지 E2E는 desktop/mobile PASS; 전체 Playwright **101 PASS / 4 SKIP / 1 FAIL**.

### E2E 단일 반복 실패의 원인과 수정
- 실패 위치: web/e2e/m0.spec.ts의 모바일 '사진: 매물·지도·상세에 생성 시연 이미지를 표시한다' 테스트. DOM은 존재·src는 가상 시연 이미지 경로이고, 기대값 naturalWidth>0이 5초 동안 0.
- **진단**: 2026-11-01 추가된 모바일 '집주인/집찾기' 진입 hero 때문에 리스트 첫 번째 카드 이미지가 초기 스크롤 화면 아래에 위치. 카드는 lazy loading, 실제 이미지 decode 요청은 뷰포트 접근시 일어남. 그러나 테스트는 scroll 없이 naturalWidth를 곧바로 검사. 실패는 복수 PR에서 동일한 테스트·위치·증상으로 반복. 사진 API의 저장/개인정보/권한이나 새 /showcase 기능 실패와는 별개.
- 수정: QA 브랜치에서 cover.scrollIntoViewIfNeeded() 후 실제 decode를 기다리는 expect.poll(...timeout:15000)으로 변경. lazy loading 기능은 유지, image src/dimensions 기능 요구사항/실제 이미지가 깨졌을 때 fail이라는 기준은 그대로. **이 수정된 HEAD의 E2E 완료 전까지 "완전 PASS"라고 주장하지 않음.**
- E2E 마커 오류라는 과거 추측은 정정: 실제 실패는 **지도 마커가 아니라 lazy photo의 naturalWidth**. GitHub Actions job 로그 원문/trace는 해당 PR에서 보존.

## 2. 기능별 위험·증빙 경계
- P13 사진은 owner JWT + consent + EXIF/APP1 차단 + 서버 180KB×6 제한 및 삭제. 그러나 full codec decode/악성파일 탐지·식별정보 완전 제거 인증은 아님. PoC DB TEXT는 정식 서비스 이전 private object store로 전환.
- P14 정형 권리후보는 PDF/개인 이름/주소/권리자/원문 ID 저장하지 않음. server-side sanitizer는 게시자 입력이 active/cancelled여도 전부 status=unknown으로 강제. 발급일은 사용자 입력값; 안전등급·보증금 회수 추정 금지.
- P15 서버 TransactionSnapshot/이미 승인된 예약·양측 제안 버전만 보여줌. 등기·계약 권한/법적 계약/송금은 계속 별도 확인. 집톡이 중립 조언/미확인 체크는 자동계약, 협상, 매도·임대 대리권이 아님.
- P16 /showcase는 정적·공개 안내. 로그인/유료 모델/API write 없이 동작, 링크를 통해 합성 시연과 인증된 거래방을 분리.
- 실제 Supabase 2계정 시나리오·본인확인기관 B/소유·임대권한 C·법률 자문·Meta 실모델 이미지 품질/토큰/비용·실 개인정보 처리/파기는 **미완료**, 사용자 결정에 따라 법무 및 실 거래는 출시 전 보류.
- [배포 정합성 issue #30](https://github.com/hobism3/meta_p2p_realestate/issues/30): Git main SHA와 Vercel READY production SHA가 동일한지 확인 필요. 코드 병합과 공개 URL 서비스 최신화/worker·스토리지 기능 성공을 구별한다.

## 3. 개발 자산 목록
- 실사진: web/components/ListingPhotoGuide.tsx, OwnerPublishedGallery.tsx, lib/gallery-image.ts, migration 019, listing gallery routes.
- 권리후보: web/components/ListingRightsBrief.tsx, lib/listing-rights-brief.ts, rights-brief API, migration 020, registry/extract + registry/check.
- 거래: lib/transaction-journey.ts, lib/jiptok-support-tasks.ts, components/TransactionProgressPanel.tsx, rooms/[rid].
- 체험: web/app/showcase/page.tsx, nav/home links, web/e2e/showcase-journey.spec.ts.
- CI: verify-fast Node+DAL/API suites, verify-e2e desktop/mobile, public-registry-educational-corpus SHA+publisher facts gate.
- 도메인별 이전 기록: docs/P13_PHOTO_GALLERY_20261102.md ~ P16_HACKATHON_SHOWCASE_20261102.md, 법률 위키 docs/legal/README.md, 권리 연구 docs/registry-cases/P12_DEVELOPMENT_LOG_20261102.md.

## 4. PoC 출시 준비 우선과제
1. 실제 CI/Preview/Production SHA·페이지·same-origin PDF worker와 gallery API의 운영 DB migration readiness를 분리 확인.
2. 오브젝트 스토리지 전환/실제 파일 보관·삭제·개인정보·과금 제어. 공개 사진은 게시자의 동의만으로 무단 사용 권리를 취득한 것이 아님.
3. 본인확인 공급자 계약, 공인 소유/대리권 확인, 임대차 법률 검토, 개인정보 처리방침·국외 이전 처리 및 보유 파기.
4. 실제 사용자 2인 계약 시나리오의 별도 운영 QA(사용자 요청으로 현재 보류).
5. Meta 예산이 거의 소진되어 실제 모델 검증은 의도적 유료 게이트로 한정. 이 배치에서 새 Meta 과금 API 호출 **0회**.
