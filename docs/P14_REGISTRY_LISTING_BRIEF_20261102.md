# P14 · 매물별 권리기재 참고정보 연결 — 구현 및 감사 (2026-11-02)

## 목표 / 법률 경계
- P8~P12의 로컬 PDF 텍스트층·권리 후보를 매물 상세 화면으로 연결한다.
- **매물의 실제 안전성·법적 소유자·보증금 반환 가능성을 인증하지 않는다.** 사용자 직접 정답 라벨 작성은 요구하지 않는다.
- 게시자와 거래 상대방이 공식 등기사항증명서를 별도로 열람하고, 미확인 서류/실권리의 현행·말소 효력을 확인할 수 있도록 한다.

## 사용자 흐름
1. 집주인이 등록 완료 후 /owner/listings/{id}에서 '이 매물 등기부 로컬 분석'을 선택.
2. /registry/extract?listingId=... 에서 PDF.js로 **브라우저 로컬** 문서만 추출. PDF·문자 원문/주소/소유자명 서버 전송 금지.
3. P12 별도 번호행 누락 검증 및 사용자 원문 확인 후 /registry/check?listingId=... 로 정형 allowlist 전달.
4. 사용자는 1~20개 권리기재 후보, 발급일을 확인하고 공유 동의·미인증 고지를 각각 체크한 뒤 POST. **가상 시연 예시 공유 불가**.
5. POST /api/listings/{id}/rights-brief는 소유자 JWT sub 확인, 합성 매물 배제, small JSON 크기 상한, 날짜/권리 타입/금액 확인.
6. 모든 게시 후보의 status를 unknown으로 서버에서 강제. '현행 유효', '말소 완료'는 신고/사용자 입력만으로 확정되지 않음. 채권최고액은 실제 대출잔액이 아니다.
7. 매물 상세 /listings/{id}에 '게시자 제공 · 공식 확인 미완료'를 표시하고, 발급일·종류/구역/순위/금액과 독립 확인할 항목(임대/대리권·선순위 임차인·세금·건축물대장) 안내. 미공유 상태는 '권리 없음/안전'이 아님.
8. 집주인 DELETE는 공개된 정형 요약 철회. 원본 PDF는 애초에 서버·Meta AI에 보관하지 않음.

## 기술 산출
- Migration 020_listing_rights_brief.sql: custom listing 별 1개 권리 공유 문서, source_kind=owner_local_review, issued_on, rights_json (구조화 field only), shared_at, shared_by.
- web/lib/listing-rights-brief.ts: 권리 kind/section/date/만원 금액 엄격 제한, 권리 1~20건, 성명·주소·채권자명·원본 ID/자유 text 필드 폐기, unknown 강제.
- web/app/api/listings/[id]/rights-brief/route.ts: 공개 GET, 등록 계정만 POST/DELETE, 원본 요청 18KiB 제한, 문서 추출 결과의 법적 확정 금지.
- web/components/ListingRightsBrief.tsx: 매물 상세 미확인 UX, 독립 확인 항목, 공식 인터넷등기소와 로컬 추출 링크.
- /registry/extract → /registry/check: 임의 URL의 listingId는 UUID처럼 보이는 식별자만 쿼리로 전달. 실제 권한은 서버에서 검사. 문자열 원문은 sessionStorage를 통해 한 번만 옮김.

## 검증
- web/tests/listing-rights-brief.test.mjs: 구조화 타입/날짜·공개 필드 검사, 개인정보 제거, 말소/현행 unknown 강제, 빈 0건 차단.
- web/tests/listing-rights-brief-api.test.mjs: 독립 SQLite + JWT owner/other, 동의/시연/개수 제한, 공개 JSON PII 미노출, 소유자 DELETE.
- CI verify-fast(unit/DAL/API), verify-e2e 격리 시연. **실계정 권리 원본·법률 판단·Meta 실호출·제3자 데이터 수집은 수행하지 않는다.**

## 다음 단계 (P15)
- 현재 거래 진행 컴포넌트가 집톡이 중립 리마인더를 이미 제공. 남은 작업은 '이 매물의 권리정보 확인하기' 버튼과 방문→합의→계약 준비 흐름의 빈 단계 표시를 더 자연스럽게 연결하는 것.
- 당사자의 합의·방문승인 이력이 있더라도 등기/소유권/대리권 확인이 자동 완료되지 않도록 UI 상태를 분리.
