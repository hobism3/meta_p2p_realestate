# 집톡이 신원·게시권한 검증 시스템 V1 (2026-11-01)

## 0. 신뢰수준을 반드시 구분
- A **로그인**: Google·이메일·Supabase JWT가 식별하는 것은 현재 애플리케이션 계정이다. 실명 인증이나 부동산 소유권이 아니다.
- B **본인확인**: 법에 따른 본인확인기관(PASS·토스·인증서 등)에서 서버 간 인증 결과가 검증된 경우다. 별도 계약과 최종 결과검증이 필요하다.
- C **매물 게시권한**: 법적 신원 B와 **해당 주소/호실 소유권 또는 임대권·위임범위 증거**를 대조한 경우다. B가 C를 자동 의미하지 않는다.

공식: KISA 본인확인기관 https://identity.kisa.or.kr/ ; 토스 인증 API https://auth-docs.toss.im/auth/integration_user.html ; KB국민인증서 https://cert.kbstar.com/quics?page=C112279

## 1. 구현된 DB 구조
Migration 017:
- user_identity_status: per-user unverified/pending/provider_verified/rejected/expired, source, keyed receipt hash, verified_at.
- listing_authority_claims: per-listing registered_owner/co_owner/landlord_non_owner/delegated_agent/other **자기진술**, attestation timestamp, 별도 verification_status (기본 미검증).
- listing_reports: category+listing+reporter 중복방지, 실제 접수번호, moderation 상태/시각/검토자. 자유 텍스트와 주민번호 불수집.

Migration 018:
- identity_provider_sessions: 10분 만료, request-id/user-id/provider-session-id, 일회성 pending→verified 또는 rejected, 이미 소비된 세션·만료 콜백 거부.

## 2. API·UI 기능
- GET /api/identity/status: Supabase JWT 인증 후 B의 유효 상태 반환; 로그인만으로 provider_verified로 승격 불가.
- POST /api/identity/start: 계약된 외부 본인확인 브리지 설정이 없으면 HTTP503; 설정이 있으면 서버-서버 요청으로 일회성 세션 생성, 오리진 일치하는 HTTPS 인증화면만 열기.
- POST /api/internal/identity/provider-callback: 공유 비밀키의 HMAC-SHA256 서명, 5분 timestamp 제한, 일치하는 10분 세션과 공급자 ID, 미소비 상태를 원자적으로 검사. 인증 성공 증거가 있어야 B를 provider_verified로 갱신.
- GET/PUT /api/owner/listings/[id]/authority: 등록계정 JWT 검증, 관계 자기진술 접수; 변경 때마다 C 독립 검증 상태 초기화.
- GET/POST /api/internal/listing-reports: 운영자 서브젝트 allowlist로 보호된 사건 접수 목록과 처리 이력.
- GET /owner: A/B 구별 표시. /owner/listings/[id]: C 자기진술. /moderation: 운영자 신고 검토. /listings/[id]: 매물 신고 접수번호와 공식 인터넷등기소 링크.

## 3. 외부 신원검증 브리지 인터페이스 (업체 계약/개발 필수)
기본값: 비활성. 실제 토스·NICE·KCB·PASS API 규약을 **추측하여 구현하지 않았음**. 계약된 벤더 어댑터가 벤더의 최종 결과조회/서명검증/복호화를 수행한 뒤 내부 브리지로 연결해야 한다.

서버 환경 설정(실제 비밀값 절대 Git 커밋 금지):
- IDENTITY_BRIDGE_ENABLED: 실제 벤더와 사내 브리지 보안 검증을 완료한 뒤에만 true로 설정. 기본 비활성.
- IDENTITY_BRIDGE_START_URL: 계약된 HTTPS 브리지 시작 URL
- IDENTITY_BRIDGE_API_KEY: 최소 24자 서버 전용 키
- IDENTITY_BRIDGE_CALLBACK_URL: HTTPS 우리 서버 callback 주소
- IDENTITY_BRIDGE_CALLBACK_SECRET: 최소 32자 HMAC 공유 비밀
- IDENTITY_BRIDGE_SUBJECT_PEPPER: 별도 최소 32자 subject HMAC 비밀
- IDENTITY_BRIDGE_REDIRECT_ORIGIN: 인증 UI HTTPS 허용 origin
- MODERATOR_USER_IDS: 서버 검증 JWT sub 목록, 쉼표로 구분

시작 요청(서버→브리지): requestId, purpose=legal_name_identity, callbackUrl, expiresInSeconds=600. 기대 결과: providerSessionId + verificationUrl. verificationUrl은 고정 출처와 HTTPS를 확인하고 브라우저에 제공한다.

완료 통지(브리지→우리 서버): requestId, providerSessionId, status=verified|rejected, verified일 때 receiptReference 및 subjectHandle(공급자 범위의 불투명 식별자) 필요. HTTP 헤더 x-identity-timestamp=10자리 UNIX 초, x-identity-signature=HMAC_SHA256_HEX(CALLBACK_SECRET, timestamp + "." + rawBody).

서버는 세션/만료/서명 일치 후 업데이트한다. 원본 실명·CI·DI·생년월일·주민등록번호는 DB에 저장하지 않고 receiptReference와 subjectHandle을 서버 비밀 pepper로 HMAC하여 필요한 증거 요약만 남긴다.

### 반드시 추가 시험할 것
실제 공급자 샌드박스에서 요청/완료·취소, 다른 사용자/세션으로의 결과 주입, 중복 콜백, 10분 만료, 검증 실패, 웹훅 위조/서명 변조, 키 교체, 장애 복구 및 운영 인증 상태를 검증해야 한다. **공급자 미계약 상태의 Mock 테스트만으로 실제 B가 작동한다고 주장 금지**.

## 4. 매물 소유권·임대권 (C) 미구현 요소
법률 제21815호 제23조의4가 2027-06-17 시행 예정이나 대통령령 위임내용·적용 주체는 시행 전에 확정 검증해야 한다.
- 소유자/공유자: 신뢰된 등기 발급처 및 매물 호실 대조, 신원 연결, 명의변경/검증 유효기간 확인.
- 법인/대리인: 위임장, 대리권 범위, 임대 권한, 신탁원부·수탁자 동의 등 별도 사실관계.
- **이름 단순 비교는 인증이 아님**. 동명이인/등기 발급 시점/주민번호 법정처리 제한을 고려.
- 사용자 진술은 C 법적 검증으로 승격되지 않음. API/DB의 verification_status=unverified 유지.
- 검증·증빙 메타데이터 최소화, 개인정보 처리 근거와 사전고지, 접근통제·보관기간·삭제 경로 선행.

## 5. 실제 출시 체크 (OPEN)
본인확인기관 계약·최종 결과 검증; 게시자 확인기관/관할 기관 해석; 매물 게시공개 정책; 신고 처리 연락/자료 제출·이의제기 절차; 처리방침·수탁사/국외이전 계약; 계정 삭제·파기; 실계정/기관 테스트; 안전한 운영 DB 접근/관리자 키. 현재까지는 브리지 보안 계층·자기진술·신고 기능 구현, **공인 본인확인과 소유권/게시권한 검증은 실제 미완료**.

## 6. 법적 참고
- 개인정보보호법 제24조의2(주민번호 제한) https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335661
- 부동산거래신고법 제23조의4(직거래 플랫폼) https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286987
- KISA 지정 본인확인 서비스 https://identity.kisa.or.kr/
