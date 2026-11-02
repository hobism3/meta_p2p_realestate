# P10 — 브라우저 로컬 PDF.js 텍스트층 자동 추출 및 위치 기반 행 복원

작성: 2026-11-02 · PR 개발 브랜치: `feat/p10-local-pdf-textlayer-20261102`

## 1. 단계 목표와 기존 버전과의 차이
P8은 `RightEntry`의 권리분석 원칙과 38개 합성 사례를 정립했다. P9는 사용자가 직접 PDF에서 텍스트를 복사해 `registry-text-extraction`로 전달하고 **상태 unknown → 사람이 확인**하는 흐름을 완성했다.

**P10은 수동 텍스트 복사를 제거한다.** 브라우저에 등록한 PDF를 직접 PDF.js로 열어 각 글자/조각의 페이지·(x,y)·폭/높이를 추출하고, Y 좌표 및 X 간격 기준으로 행/열 경계를 복원한다. 이 텍스트를 기존 P9 후보 추출기·사람 승인·P8 권리분석에 연결한다.

`PDF 선택 → 로컬 글자/좌표 → 페이지/행/열 경계 복원 → 권리기재 후보(unknown) → PDF 원본과 대조 → 선택한 정형 값만 P8 분석`.

**중요: PDF를 직접 읽는 것이지 'OCR'이 아니다.** 이미지 스캔, 실제 말소선/취소선, 별지와 공동담보의 법률 효력·실제 판결/등기 진위 등은 이 단계에서 확인하지 못한다.

## 2. 구현 구성
|코드|책임|보안 / 해석 한계|
|---|---|---|
|`web/lib/registry-pdf-local-reader.ts`|클라이언트 동적 import `pdfjs-dist/legacy/build/pdf.mjs`, 20페이지·8MB 제한, `getTextContent`의 문자 위치 추출|File 바이트는 사용자 브라우저 안에서만 처리. HTTP 업로드·Meta 호출 없음|
|`web/lib/registry-pdf-layout.ts`|각 페이지의 TextItem 위치에서 Y 행/ X 열 분리; `[PAGE N]`와 `|` 경계를 만들어 P9에 연결|순수 결정론적 함수. 텍스트층 없는 페이지, 과다 크기, 좌표 손상을 관찰하고 중단/경고|
|`web/scripts/copy-pdf-worker.mjs`|npm 종속 `pdfjs-dist@4.10.38`의 작업자를 predev/prebuild에서 같은 앱의 `public/pdf.worker.4.10.38.min.mjs`로 복제|CDN 없음. 패키지 버전 검사/원본 크기 검사, worker bundle은 Git에는 추가하지 않음|
|`web/app/registry/extract/page.tsx`|PDF 선택 직후 자동 텍스트 추출·후보 화면; 자동 로딩/결과·오류·누락 페이지 안내; 수동 편집·원문 대조 유지|문서/개인정보는 서버에 보내지 않으며 선택한 구조화 값만 1회 세션 전송|
|`web/tests/registry-pdf-layout.test.mjs`|가상의 글자 좌표 배열이 뒤섞여도 페이지/행/열 순서를 재구성하는지, P9가 금액·권리를 정형화하는지 검증|허구 좌표 골든이지 실 PDF/OCR 정확도는 아님|
|`web/e2e/registry-pdf-local.spec.ts`|브라우저가 서버 제공 **가상 PDF 샘플**을 로컬 worker에서 읽는지, POST/외부 모델 전송이 없는지, 사용자 확인 없이 전달하지 않는지 검증|PDF는 실제 부동산 증명서가 아닌 가상 ASCII 샘플. 텍스트층 추출과 권리판단 검증을 분리|

npm 메타데이터/배포판은 [Mozilla PDF.js Getting Started](https://mozilla.github.io/pdf.js/getting_started/)와 npm `pdfjs-dist@4.10.38`에서 확인했다. 버전은 앱 JS와 worker가 반드시 일치한다.

## 3. 보수적 판단과 실패 정책
1. PDF 8 MiB 초과/100바이트 미만, 헤더 불일치, 암호화 또는 비정상 파일은 거부.
2. 최대 20페이지, 페이지당 9,000글자 객체, 전체 복원 텍스트 120,000자. **부분만 잘라서 '문제 없음'이라고 결론 내지 않는다**.
3. PDF.js 표 문자의 Y 좌표 간격으로 행을 복원하고 X 간격이 충분할 때 `|`를 삽입한다. 실제 법원 등기부의 복잡한 병합셀·취소선·별지는 좌표만으로 완전히 복원할 수 없다.
4. PDF에 문자 추출이 불가능하거나 **일부 페이지 텍스트층이 비면** 자동 분석/전달을 중단한다. 사용자는 원본을 직접 확인하고 기존 수동 점검 화면으로 이동할 수 있다.
5. 후보는 모두 `status:"unknown"`. 말소 행의 연결 힌트는 원문 대조를 요구할 뿐 실제 말소로 자동 변경하지 않는다.
6. 원본 파일, 텍스트/좌표, 소유자/권리자명과 주소를 UI의 원문 확인 경로 이외의 DB·세션·HTTP·모델 API에 전송하지 않는다. 사용자 세션 전달은 검증된 allowlist `RightEntry`만 포함한다.
7. 사용자 취소/다른 PDF 선택 시 오래된 async 결과가 UI를 덮지 않도록 요청 세대번호로 무효화한다. PDF.js가 이미 읽고 있는 파일의 완전 작업 중단 여부는 별개로 추후 개선 과제.
8. PDF.js 작업자는 **같은 도메인**에서 내려받고 HTTP 외부 CDN을 사용하지 않는다. 사용자 PDF 내용은 작업자 경로에 섞지 않는다.

## 4. 검증 분리
- **텍스트층 추출 가능성**: 실제 합성 PDF 파일로 PDF.js worker가 브라우저에서 동작하는지. 테스트 대상은 법률 문서가 아닌 가상 파일.
- **행/열 복원**: 좌표 기반 가상 TextItem goldens의 분리와 P9 정형화가 기대대로 동작하는지.
- **권리 분석**: P8의 38개 합성 권리정형 golden + P9의 15개 가상 복사 텍스트 golden 유지.
- **실제 등기부 품질**: 공개 PDF·사용허락 문서를 확보해 페이지·행·값/말소 취소선·근거 좌표를 사람이 주석한 truth set으로 검증하는 것은 **후속 연구**.
- **법률상 의미**: 실등기 여부·신탁 동의·보증금 회수·계약의 안전성 검증까지 코드 PASS가 뜻하지 않는다.

## 5. 병렬 사진 AI
- 별도 PR #25(`feat/visual-listing-guide-20261101`): 실내사진/옵션/누락 공간/가구 없는 보기 등 사진 기반 등록 UX. P10은 `web/app/registry/*`, `web/lib/registry-pdf-*`, PDF worker, e2e PDF, 독립 문서만 수정한다.
- 사진 분석 결과를 등기상 소유권·근저당·신탁 권리 입력으로 자동 승격하지 않는다.
- 병렬 브랜치 변경 파일 교집합 확인 및 병합 결과는 `P10_DEVELOPMENT_LOG_20261102.md`에 기록.

## 6. 후속 P11 후보
1. 국내 허구/재배포 허용 원본 PDF의 페이지별 bounding boxes 및 말소선 주석 정답 확보.
2. 구조화 성공률(권리 타입 precision/recall, 금액 exact match, 누락페이지 판단, false-safe refusal) 측정.
3. 취소선/병합 셀/다중 페이지의 레이아웃 모호성에 대한 **시각 증거 주석**(후속 로컬 canvas 렌더 기반), 확인 필요 플래그/사용자 선택 UX.
4. 스캔본은 별도 **로컬 OCR 가능성 조사** 및 인식/정책 정확도 분리. 제3자 전송은 계약/동의·개인정보 처리 검토 후 결정.

## 7. 재현/CI
```sh
cd web
npm ci
npm run build
node --test tests/registry-rights-analysis.test.mjs
npx playwright test e2e/registry-pdf-local.spec.ts
```
npm `prebuild`가 worker를 같은 도메인의 `public`으로 복사한다. `npm ci`는 잠금파일의 설치무결성을 검사한다. PR/main SHA와 첫 CI 실패가 있으면 별도 개발 로그를 append한다.
