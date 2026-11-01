# P8 ↔ 시각 AI 병렬 개발 인터페이스 (2026-11-01)

## 관찰된 Git 작업 현황
- 사진 AI 브랜치: feat/visual-listing-guide-20261101. P8 시작 시 HEAD bd7c56fab445ffa4a8d9c2fe906a3f18b4200d9f (당시 main과 동일), 열린 PR 없음. 이는 Git 커밋 상태의 확인이지 옆 채팅의 전체 내용을 직접 열람한 것은 아니다.
- 이번 사례 연구 브랜치: feat/p8-registry-casebook-benchmark-20261101. 상대 브랜치/사진 매물등록 소스는 수정하지 않는다.
- 사용자 방향: **사진을 활용한 매물 등록 촬영/공간 가이드 우선**, 3D 모델 배제, 거래방 집톡이 사진 Q&A는 우선순위 낮음.

## 역할과 책임 경계
|분야|개발 목적|소스|금지할 추론|
|---|---|---|---|
|집 사진 VLM|공간/촬영각도/사진 누락 안내 및 매물등록 UX|시각 AI 브랜치의 register/vision/photo 컴포넌트|사진만으로 등기상 소유권, 담보 설정 유무, 임대권한 확정|
|등기 권리 분석|현행·말소·효력 미확인, 채권최고액·공동담보·말소 약속 검토|P8의 registry-rights-analysis.ts, registry-cases.v1.json, registry-casebook.test.mjs|법률상 우선순위/안전등급/채무잔액/보증금 회수액 확정|
|향후 문서 OCR/VLM|권리 표/행/금액/날짜/말소 표기 추출, 신뢰도·근거 위치 표시|**별도 미래 파이프라인**, 현재 P8에는 문서 인식 호출 없음|텍스트 추출 confidence를 법적 효력·실제 소유자 검증률로 오인|

## 상호 연결 시 데이터 계약
사진 가이드는 등기부 권리 분석에 바로 입력하지 않는다. 향후 **정식으로 사용 가능한 등기 문서**를 인식하는 OCR/VLM이 붙는 경우 별도 검증 어댑터를 거쳐 아래의 입력 후보로 변환한다.

~~~ts
type ExtractedRightCandidate = {
 kind: RightKind;
 section: "갑구" | "을구" | "unknown";
 status: "active" | "cancelled" | "unknown";
 registrationDate?: string;
 rankNumber?: number|null;
 claimMaximumManwon?: number|null;
 jointCollateralMentioned?: boolean;
 cancellationPromised?: boolean;
 provenance: {
   sourceType:"manual" | "licensed_document" | "educational_synthetic";
   locator?:string;
   extractionConfidence?:number;  // 문서추출 모델의 신뢰도, 법적 인증아님
   independentlyVerified:boolean;  // 기본 false
 };
};
~~~

- 실제 원본 PDF/식별 가능한 소유자명/주민번호/주소/민감 crop 및 증명서 전체 텍스트는 이 RightEntry 계약을 통해 전파하지 않는다.
- 별도 확인이 안 되면 status=unknown, independentlyVerified=false가 기본. 사용자가 직접 입력한 경우도 플랫폼의 공적 진위확인은 아니다.
- 기존 Meta 외부전송 제한은 그대로 유지: 허구 샘플 해시 외 실제 등기 PDF를 보내지 않는다.
- 소유권 B/C 실제 인증은 본인확인 기관·등기 발급출처·대리권 검증을 필요로 하는 별도 신뢰 절차.

## 서로 다른 테스트 축
1. 사진 VLM: 공간/촬영 가이드/과장 설명 평가 (옆 브랜치).
2. 등기 문서 파싱: 앞으로 적법하게 사용 가능한 허구/라이선스 문서에 대한 문자·좌표·말소·권리·금액 OCR 평가. 지금 미구현.
3. 권리 해석 규칙: P8 38개 합성 RightEntry fixture의 기대 발견/수치/미확인 항목 비교. 실 PDF OCR 정확도라고 주장 금지.
4. 통합 검증: PII 최소화/외부 송신·로그/공급자 계약/데이터 보관·파기 분리.

## 작업 충돌 방지
- P8 수정 영역: registry-rights-analysis, registry/check, registry/cases, tests/fixtures/registry-cases, docs/registry-cases.
- 시각 브랜치 영역: register + photo/visual components, 해당 테스트/문서 (기존 사진 시나리오).
- 공동 README, DEVELOPMENT_LOG, ROADMAP을 동시에 수정한다면 각 브랜치의 최신 main과 diff를 재확인하고 문단 단위로 조정한다.
- 실제 저장소 브랜치/PR/HEAD가 확인되지 않았다면 옆 대화의 코드를 임의로 추측하지 않는다.

## 결론
집 사진으로 매물을 쉽게 등록하도록 하는 시각 AI와 등기부의 법률/권리 사실을 보수적으로 분석하는 P8은 **서로 다른 모듈**이다. 미래 문서 OCR이 생길 때만 검증 가능한 RightEntry 후보를 인계한다. 이번 P8은 시각 개발 코드를 건드리지 않는다.

## 2026-11-01 동시 개발 브랜치 후속 확인 (실제 Git 기준)
- 사진 가이드 개발 브랜치 **PR #25**: https://github.com/hobism3/meta_p2p_realestate/pull/25 (head `5fda26c`). `verify-fast` **SUCCESS**, `verify-e2e` **SUCCESS**, 확인 당시 PR OPEN. 해당 채팅의 [설계·실행 기록](../VISUAL_LISTING_GUIDE_20261101.md)은 이 브랜치가 아니라 사진 PR에서 생성한 문서이며 main 병합 전에는 링크가 열리지 않을 수 있다.
- 사진 PR의 구체적인 구현 범위: 매물 등록 Wizard의 사진 가이드, 최대 6장 메모리 처리/EXIF 제거, 중복·밝기 검사, 사각형 수동 마스킹, 동의 후 선택적 Meta VLM 공간분류/옵션 후보/PII 노출 후보. **실물 사진 저장·실제 게시, 3D, SAM 자동분할, 사진 기반 집톡이 질의응답은 범위 밖**.
- P8의 별도 PR #26과 Git 변경 파일을 비교: 처음 겹쳤던 `.github/workflows/verify-fast.yml` 및 `docs/DEVELOPMENT_LOG.md`은 P8에서 main 버전으로 되돌림. P8 새 goldens는 기존 `web/tests/registry-rights-analysis.test.mjs`에서 import하여 CI에 실리며 기록은 `docs/registry-cases/DEVELOPMENT_LOG_20261101.md`에 보관. **두 열린 PR 변경 파일의 교집합 0개**.
- 사진 AI에서 반환한 `room`, `features`, `privacyFlags`는 **매물 등록 정보 후보**다. 이를 근저당·신탁·전세권 등 법적 권리 항목으로 자동 매핑하는 인터페이스를 만들어서는 안 된다.
- 사진과 등기 문서의 개인정보 처리는 별도 데이터 흐름/외부 모델 송신 동의·국외이전·파기 정책으로 검토해야 한다. **Meta 사진 분석에 대한 동의**가 **등기 원문 전송에 대한 적법한 근거**가 되는 것은 아니다.
