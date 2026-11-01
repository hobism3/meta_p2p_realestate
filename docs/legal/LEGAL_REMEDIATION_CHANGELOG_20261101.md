# LEGAL REMEDIATION — 변경·검증 기록 (2026-11-01)
> GitHub branch `review/legal-regulatory-20261101`, PR #22. 아래 변경은 코드에 **작성된 사항**이며 CI/운영 배포 확인 전까지 프로덕션의 위험 해소를 의미하지 않음.

## 실제 발견 → 변경 맵
|문제|기존 코드 증거|보완 코드|검증|
|---|---|---|---|
|법률 제21815호 직거래 법률 누락|1차 법률 보고서 LEG-04 중심|LEGAL_DEEP_DIVE / LEGAL_ISSUES, 시행일/광고·신원 검증·모니터링 분리|법제처 법률 제21815호 공포·부칙 대조|
|원본 PDF 전체 Meta 전송|registry-draft.ts `pdf.toString("base64")`가 Meta `file_data`에 들어감; 파일명 'redacted'지만 실제 마스킹 없음|서버 SHA-256 allowlist `isSyntheticRegistryDemoPdf()`, 비허용은 외부 Meta fetch 전에 HTTP422|registry-draft.test.mjs 신규 변경 샘플·임의 파일 거부|
|실 PDF 플랫폼 서버 업로드 위험|RegistryImport.tsx base64 JSON 서버 전송|클라이언트 SHA-256 검사로 **업로드 전 차단** + 서버 재검사 + API GET 공개 합성 SHA 목록|브라우저 Web Crypto/서버 API CI 확인 필요|
|Meta/PDF 마스킹과 동의문구 부정확|REGISTRY_AI_IMPORT.md + RegistryImport UI|합성 시연 예시만 허용한다고 변경; Meta 요청 파일명 `synthetic-registry-demo.pdf`|문서/코드 대조|
|사용자 매물 전체를 가상 매물로 혼동|rowToListing `synthetic:true`; 홈페이지/푸터 전체 합성 표기|사용자 등록 매물 `synthetic:false`, 합성 기본 매물 별도 표시, 공개 배지 '신원·게시권한 미검증'|api.test.mjs 조회/assert 추가|
|내부 인증 계정 ID 공개|GET `/api/listings`, GET `/api/listings/[id]`가 `ownerId` 포함|공개 GET 응답에서 `ownerId` 제거; 내부 소유자 인증/권한 로직은 별도 유지|api.test.mjs 공개 목록·상세의 ownerId 부재 검증|
|가짜 신고 접수 UI|상세의 `setReported(true)`만으로 접수됨 표시, 서버 저장 없음|신고 버튼/접수 성공 상태 제거하고 실기능 부재 알림|정적 코드 검증; 실제 신고 접수 기능은 OPEN|
|소유권 검증 오인 UI|상세에서 미검증 제출 여부 배지|명시적 '게시자 신원 미검증/관계 미검증' 문구|정적 코드 검증|
|채팅 합의 '법적 효력 없음' 오인 가능|TransactionProgressPanel.tsx '최종 조건 확정' 안내|플랫폼 내 이력/계약 서비스 아님 + 대화 자체는 법률 효과 가능성 고지|법률 문안 법무 최종 검수 OPEN|

## 변경 파일 목록
- `web/lib/registry-draft.ts`: 서버 가상 해시 allowlist 및 클라이언트용 목록
- `web/app/api/listings/import-registry/route.ts`: 서버 송신 차단 및 capability / 동의 문구
- `web/components/RegistryImport.tsx`: 사전 클라이언트 차단/문구 교정
- `web/tests/registry-draft.test.mjs`: 엄격 허구 샘플 검증
- `web/lib/db.ts`, `web/app/api/listings/route.ts`, `web/app/api/listings/[id]/route.ts`, `web/tests/api.test.mjs`: 매물 출처 및 계정 ID 최소화
- `web/app/listings/[id]/page.tsx`, `web/app/page.tsx`, `web/app/layout.tsx`, `web/components/TransactionProgressPanel.tsx`: 표시·오인 위험 완화
- `README.md`, `docs/REGISTRY_AI_IMPORT.md`, `docs/legal/*`: 법률 근거·정정·엔지니어링 명세

## 미해결
- 실제 Meta 제공자 문서/계약·데이터 처리지역/보존/학습: 확인 못함.
- 사업자 운영 주체/수익모델에 따른 공인중개사법 적용: 전문가 자문 필요.
- 신규 직거래 플랫폼 신원·소유자 관계 확인: 법령/대통령령 세부조건 확인 + 인증 벤더/정책 설계 필요.
- 현재 `synthetic=false` 사용자 매물은 사실/소유권 검증과 다름. 광고 필수 정보 검수/신고·모니터링 대응 미구현.
- 실제 처리방침/약관/데이터 삭제/수탁자 관리, 계정 삭제 구현: 법률/운영 검증 미완료.
- 사용자의 실사용자 2인 거래 QA는 요청에 따라 보류. 자동 Mock CI는 프로덕션 법률 적합성을 입증하지 못함.

## 운영 release gate
1. verify-fast (build + 주요 회귀) 확인; 브라우저 보호 조치·서버 거부동작을 검증.
2. PR을 병합했다면 새 main 커밋과 Vercel 실제 배포 버전을 확인해야 운영 반영을 주장할 수 있음.
3. 민감 원본 PDF가 **브라우저→서버 및 서버→Meta**로 전송되지 않았음을 허구 파일/비허용 파일로 검증; 실제 개인정보 문서를 테스트에 사용 금지.
4. 개인정보·법무 확인·광고/게시자 검증 전 정식 영업/실데이터 처리를 승인하지 않음.

## 2026-11-01 추가 검증 게이트
- `web/tests/registry-import-privacy-api.test.mjs`: Meta 모드를 **활성화**한 격리 Next 서버에서, 해시 불일치 합성 PDF 업로드가 HTTP 422로 거부되고 공개 capability의 허용 해시 목록이 서버 라이브러리와 일치하는지 검사. 실제 Meta 키/실 개인정보·실 사용자 데이터는 사용하지 않음.
- `.github/workflows/verify-fast.yml`: 위 테스트를 API 회귀 검증에 추가. 기존 `web/tests/api.test.mjs`에는 사용자 등록 매물의 `synthetic:false` 및 공개 `ownerId` 제거 검사.
- 이 회귀 테스트는 외부 Meta 전송에 대한 **실제 운영 네트워크 패킷 관찰**을 대체하지 않는다. 메타 API 자격증명 없는 격리 환경에서의 로직 검증임.
