# P13 | 실매물 사진 게시 및 갤러리 개발 기록 — 2026-11-02

## 범위
기존 사진 가이드 PR #25는 main 커밋 bb4fe7a 로 병합되었다. P13은 사진 선택 → Canvas JPEG 리사이즈·EXIF 제거 → 불투명 사각형 마스킹 → 집주인의 별도 게시 동의 → 작은 JPEG 파생본 저장 → 매물 카드·상세 페이지 갤러리 → 집주인 삭제를 연결한다.

**대규모 서비스용 스토리지·실물 사진 보존을 구현했다고 주장하지 않는다.** 별도 Supabase Storage bucket/키/권한 설정 없이, PoC용으로 데이터베이스에 허가된 게시용 파생 이미지만 소량 보관한다.

## 개인정보와 게시 경계
1. 브라우저 원본 입력: 8MiB 이하 JPEG/PNG/WEBP. 기존 ListingPhotoGuide가 Canvas JPEG로 리사이즈해 메타데이터/EXIF를 제거하고 사용자가 직접 지정한 영역을 불투명하게 가린다.
2. 등록 완료 후 /owner/listings/{id}#owner-gallery에서 별도 게시 확인을 체크하고 사진별 '확인한 사진 공개하기'를 눌러야만 공개한다. Meta 사진분석은 별도 opt-in이며 게시 자체에 필요하지 않다.
3. POST /api/listings/{id}/gallery: 180KB JPEG, 100~1600px, SOI/SOF/SOS/EOI 헤더 확인, APP1/EXIF/COM 마커 거부, request body 256KiB 제한, strict data URL 및 SHA256 중복 금지. **실제 이미지 전체 디코딩·멀웨어·이미지 내부 개인정보 탐지는 서버가 수행하지 않는다.** 개인정보를 완벽하게 검출했다는 뜻이 아님.
4. 서버 인증 JWT sub가 custom_listings.owner_id와 정확히 일치해야 게시·삭제 가능. 시연용 Seed 매물에는 게시 불가. PostgreSQL에서는 listing row lock, SQLite에서는 DAL 쓰기 트랜잭션을 사용해 매물별 6장 상한을 검사한다.
5. GET 목록은 게시 이미지의 ID, 허용된 공간 enum, masked 표시, 게시시각 및 URL만 노출한다. owner ID/이미지 bytes/원문은 JSON에 담지 않는다. 이미지 응답 헤더는 image/jpeg·nosniff·same-origin·no-store. DELETE 후 DB의 파생 이미지 행 삭제.
6. **게시된 이미지 자체는 공개 정보다.** 인물·문서·택배 라벨·거울 반사 등 개인정보는 사용자가 반드시 확인해야 한다. 이미지 업로드만으로 소유권/매물 진위·건물 안전을 보증하지 않는다.
7. AI 가구 제거/복원 시뮬레이션은 서버에 저장하거나 실제 매물 사진으로 게시하지 않는다. 합성 AI 이미지와 실제 등록 이미지를 UI에서 분리한다.

## PoC 스토리지 / 추후 이전
- Migration 019_listing_gallery.sql: listing_gallery_photos, JPEG Base64 TEXT 180KB x 6 사진/매물(인코딩 후 최대 약 1.5MB/매물), 기존 DB·DAL 재사용.
- Vercel 임시 파일시스템은 영속 미디어 저장에 사용할 수 없으므로 DB 사용. 성능·백업·비용·용량·개인정보 파기 측면에서 정식 서비스에서는 **비공개 오브젝트 스토리지 + 권한검사 업로드/삭제 + CDN/파생 이미지 + 보존기간/삭제**로 전환해야 한다(후속 Issue #28).
- 운영 Supabase DB 연결·실 사용자 신원 확인·실 사진 개인정보 제거 품질·2계정 실거래와 유료 Muse 실호출은 이번 단계에서 검증하지 않는다.

## 자동 검증
- web/tests/gallery-image.test.mjs: JPEG/EXIF·URL/위장·크기·데이터 입력 상한·라벨 타입 검사.
- web/tests/gallery-api.test.mjs: 격리 SQLite+가상 JWT로 소유자/타인, 동의, API 중복, JPEG GET, 삭제·민감정보 미노출 검사.
- GitHub verify-fast의 unit+DAL/API에 테스트 추가. 기존 verify-e2e 격리 브라우저 검증.
- 테스트 통과가 영상에 있는 모든 개인정보를 가렸다는 증거나 실제 시각 모델 정확도의 증거는 아니다.

## 미완료 항목
- 사진 촬영 원본의 비공개 보존, 게시 전 비공개 초안·재정렬, 이미지 고용량 처리, 대량 운영 스토리지 이전, 전사용자 개인정보 파기와 백업 삭제, 비로그인 사용자 트래픽 운영 한도, 실제 인증된 2계정 게시·삭제 수동 E2E.
- 로컬 개발자 별명 인증으로 생성한 예전 매물의 owner_id가 실제 JWT와 다를 수 있어 사진 게시가 거절될 수 있다. 보안상 owner 우회는 제공하지 않는다.
