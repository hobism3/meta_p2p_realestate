# P9 작업 기록 · 2026-11-02

## 사용자 목표/범위
P8의 권리관계 사례집과 P8 규칙 분석 앞에 **PDF에서 읽을 수 있는 글자 근거 → 구조화 후보 → 사람 확인** 층을 붙인다. 정식 법률 출시나 실제 사용자 거래 QA는 후순위. Git에서 검증/실패·수정·설계 판단을 버전 관리한다.

## 기준선
- `main`: P8 PR #26 merge commit `52fd46b`, 이후 P8 문서 갱신 커밋.
- 사진 시각 AI: PR #25 `feat/visual-listing-guide-20261101` 별도 브랜치 (독립 구현). P9는 해당 브랜치/사진 업로드/Meta 경로를 수정하지 않음.
- P8 권리 해석 Golden: 38개 합성 정형 입력 기반 테스트. **실 PDF 추출 정확도가 아님**.

## 이번 P9 구현 범위
1. `registry-text-extraction.ts`: 갑구/을구 표제·등기목적 숫자 행, 권리 타입, 근저당 채권최고액(완전한 만원 단위일 때만), 등기일, 말소 행 간 연결 힌트, 페이지/줄 구조화.
2. `registry-text-layer.v1.json`: 15개 독립 작성 교육용 합성 텍스트 시나리오. 누락/말소/다중권리/금액 변환/잘못된 원단위/표제부-근저당 단어/그냥 설명 문장/PII sentinel 등 포함.
3. `registry-text-extraction.test.mjs`: 15 Golden + 비권리 단어/말소 미확정/민감 문자열 미반환/입력 길이 및 행 상한 시험.
4. `registry-extraction-transfer.ts`: 원문 텍스트/이름/주소 제거 후 검토한 정형 입력만 1회성 세션으로 이동. 관련 유효성 테스트 포함.
5. `/registry/extract`: 직접 PDF 로컬 열람(브라우저 URL), 텍스트 붙여넣기/15개 가상 예시, 후보별 근거/인식 실패 설명, 사용자가 원문 대조 후 현행/말소/미확인 선택, 정형 데이터만 P8로 가져오기.
6. `/registry/check`: 1회성 전달된 정형 후보 수신 후 원본 sessionStorage 항목 제거, P8 분석 실행.
7. `tools/registry_pdf_text_local.py`: 선택적 pypdf 기반 오프라인 PDF 텍스트층 추출 CLI(원본 PDF 서버·모델 미전송). 개인 출력 파일은 git 외부에서 0600으로 생성/기존 덮어쓰기 방지.
8. `registry-rights-analysis.test.mjs`에서 P9 테스트를 import해 기존 verify-fast 실행 경로에 포함. 시각 AI PR #25가 수정하는 CI workflow 파일은 건드리지 않음.

## 데이터 경계/해석 보수성
- 추출기는 PDF 자동 인식/OCR이 아니라 복사 가능한 텍스트층 **후보** 처리.
- 신탁/근저당/경매 단어가 등장해도 **갑구/을구의 번호가 있는 등기목적 행이 아니면 거절**.
- 채권최고액은 해당 단어 바로 뒤의 정확한 돈 단위가 있을 때만 후보. 보증금/청구금액/시세는 금액 후보 아님.
- 말소 행을 찾더라도 실제 취소선/삭제된 권리라고 자동 판단하지 않으며, 모든 후보 status=unknown, reviewRequired=true.
- 입력 원문/소유자명/주소/PII는 결과·세션/서버/외부 Meta에 저장하지 않는다. 세션에는 사람이 선택한 정형 데이터만.
- 생성형 모델/외부 법률 권위/신원 확인 B·권한 C 검증 통과로 오인하지 않는다.

## 외부 실 PDF 확보/검증 이력
- 당당 등기부 해설의 normal/provisional-attachment/mortgage-60/multi-risk/lease-fixed-date-only PDF 링크에 대한 웹 fetch/click가 계속 Cache miss. **실제 파일 수집·원본 텍스트 OCR 실험이라고 보고하지 않음**.
- 국립아동권리보장원 주거 안내의 공개 PDF에는 등기사항증명서 교육 예시가 기술되어 있으나 PDF screenshot 호출이 Cache miss라 원본 페이지 시각 대조 불가.
- 골든은 이들의 **형식 유형을 참고한 개발자 직접 제작 합성 텍스트**. 실제 원본 문서 정답 정확도가 아니라 추출 로직 회귀를 검증한다.

## 상태 및 앞으로의 이력
- 이번 기록은 코드 반영 기준. PR/CI/운영 배포의 최종 판정은 후속 기록으로 append.
- 실명 본인확인, 소유·위임권한, 개인 실등기 API 등 출시/법률 외부 의존 및 실계정 2인 거래 검증은 사용자 요청으로 보류.
- 사진 기반 매물 등록 가이드는 PR #25에서 독립 처리. P9와 변경 파일 교집합을 PR 생성 후 확인한다.

## 2026-11-02 · 독립 PDF 텍스트층 추출 가능성 로컬 확인
- Python ReportLab과 공개 한국어 글꼴로 **개인정보가 전혀 없는 1페이지 가상 등기 표**를 생성.
- PDF 스킬 렌더러로 160dpi PNG 1페이지 생성 후 육안 검토. 갑구/을구/가압류/근저당설정/근저당말소/채권최고액 레이블 가독성 확인.
- Python pypdf로 해당 합성 PDF의 텍스트층 **293자** 추출, 위 항목 한국어 Unicode 매칭 확인.
- 이 과정에서 법원·당당 등의 외부 PDF 파일을 가져오거나 검증한 것이 아니다. 로컬 생성 합성 문서 기반 **PDF 텍스트층 추출 가능성**을 확인한 것이다. Git에는 PDF·폰트/원문 텍스트를 업로드하지 않았다.
- CI 최초 빌드 오류: React 화면에서 `claimMaximumManwon?: number|null`를 `===null`만 체크해 `undefined` 타입 가능성을 놓침. `==null`로 처리하도록 수정(commit `012df79b`). 다음 CI로 재검증한다.

## 2026-11-02 · P9 검증 및 main 병합 확정

- P9 PR: [#27](https://github.com/hobism3/meta_p2p_realestate/pull/27). 브랜치 `feat/p9-local-registry-evidence-extraction-20261102`, 테스트된 HEAD `1be8a13a`; `main` squash merge commit **`079ac0a747be4d514bd2539cf975273fd0f27ced`**.
- HEAD `1be8a13a`의 `verify-fast` **SUCCESS**: Next.js production build PASS, Node unit + DAL **320/320 PASS**, API + READ_ONLY **206/206 PASS**. 신규 text-layer 15개 골든과 개인정보 차단·상태 수동확정·1회성 전달 테스트 포함.
- E2E는 `main` 병합 시점 GitHub에서 **in_progress**였으며, 사용자 요청에 따라 실제 2인 거래/실서비스 검증을 병합의 필수 조건으로 두지 않았다. 최종 자동 E2E 결과는 별도 조회해 후속 기록한다.
- 병합 전 실제 Git PR #25(사진 가이드)와 #27(P9)의 changed filenames 비교에서 **교집합 0개**. P9는 사진 관련 코드, Meta 사진 전송 경로, 공유 `verify-fast.yml` 및 중앙 `DEVELOPMENT_LOG.md`를 수정하지 않음.

### CI 실패/수정 이력 보존
1. 브라우저의 `claimMaximumManwon?: number|null`를 null만 체크하여 TS compile fail → nullable optional 핸들링 수정 `012df79b`.
2. PDF signature Uint8Array 스프레드에 ES5/downlevelIteration 제약 → `Array.from` 사용 `9859cf48`.
3. 추출기 생성 코드의 주석 안에 잘못 들어간 literal backslash-n으로 변수가 주석처리되는 문제 → 실제 줄바꿈 교정 `e7c7878e`, `87f043bf`.
4. Node strip TypeScript 실행에서 `registry-rights-analysis` 확장자 없는 런타임 의존성을 찾지 못함 → 타입 전용 import로 변경하고 명시적인 허용 권리종류 집합 적용 `1be8a13a`. 이후 320+206 PASS.
5. 테스트를 통과시키기 위해 출처/금액/상태 관련 golden 기대값을 낮추거나 삭제하지 않았다.

### 오프라인 자체 생성 PDF 검증
- ReportLab 합성 PDF 1페이지(진짜 등기부/개인정보가 아님)를 렌더링하고 육안 검토. pypdf Unicode 텍스트 추출 성공, 권리 표 한국어 유지.
- 같은 PDF를 `registry_pdf_text_local.py`의 로컬 실행 구조로 재검증: PDF 1페이지/텍스트 302자 출력, `0600` 파일 권한, 덮어쓰기 거부, 동의 플래그 없으면 실행 거부 확인. 테스트 출력 텍스트는 로컬에서 삭제했으며 Git에 원문 PDF/폰트를 올리지 않았다.
- 원본 외부 교육용 PDF 5종의 실제 판독, 스캔본 OCR/취소선, 부동산의 법적 위험 판정, 정식 Meta 외부 모델 분석은 **미완료**.

### 다음 최우선 개발 후보
- 사용·재배포가 허용된 별도 합성 한국어 PDF를 정식 fixture로 확보해 **PDF 텍스트층 정확도**와 **의미 추출 정확도**를 분리 측정.
- 가압류/압류/근저당/신탁/말소 취소선을 실제 이미지 레이아웃 좌표와 비교할 수 있는 브라우저 로컬 PDF 라이브러리 도입 및 검증. 현재 PDF 파서/추출 자리에 외부 CDN script를 주입하지 않음.
- 원본 개인정보의 수집/외부전송 적법성, 실 본인·소유권 독립 인증, 실제 거래 E2E, 서비스 운영/법률 자문은 출시 전 별도 게이트로 유지.

## 2026-11-02 · P9 병합 후 E2E 및 병렬 작업 확인
- P9 최종 테스트 커밋 `1be8a13a76ba9c3097e592c2ef4de2e308797b3f`의 **verify-e2e completed / SUCCESS**. Playwright **82 passed / 4 skipped / 0 failed**. CI-fast의 단위·DAL 320/320 및 API 206/206 PASS와 분리 기록.
- 최종 사용자 2인 실제 거래 및 외부 실 등기 PDF 판독/OCR, Production 배포는 이 E2E의 증빙 범위가 아님.
- 시각 AI PR #25는 별도 작업으로 **OPEN**, 최근 HEAD `87ff2f3b`. PR #25/#27의 실제 Git 변경파일 목록을 재비교해 **중복 파일 0개**임을 확인. P9에서 사진 AI 가이드의 코드, 테스트/워크플로를 병합하지 않았다.
- P9는 법적 신원·임대권한/보증금 안전판정과 구별되는 **사용자 검토를 거친 정형화 지원 기능**으로만 main 병합됨. 후속 OCR/원본 진위·편집가능한 실제 PDF parsing은 독립 작업.
