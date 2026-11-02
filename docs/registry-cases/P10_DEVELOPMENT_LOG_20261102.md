# P10 개발/실험 로그 — 2026-11-02

## 단계 원칙
- 사용자의 요청: 이전 P9에서 구현한 PDF 텍스트 복사→권리 후보를 **자동 로컬 PDF 추출**로 발전시키고, 가능한 범위까지 구현/검증/문서화 후 Git에 남길 것.
- PoC 개발 단계. 자동 테스트 통과 ≠ 법률적 진위/권리순위/보증금 안전성 검증.
- 사진 기반 매물등록 시각 AI는 별도 PR #25. P10은 해당 사진 관련 코드/워크플로/중앙 개발로그를 수정하지 않는 방향.

## 구현한 내용과 원인
- Browser PDF.js `pdfjs-dist@4.10.38`를 **정확한 버전으로 pin**하고 `package-lock.json`에도 무결성·버전을 기록.
- next predev/prebuild에 `scripts/copy-pdf-worker.mjs` 추가. 선택한 PDF 바이트는 사용자 브라우저만, PDF worker 코드는 앱과 같은 도메인에서 다운로드. 외부 PDF.js CDN·임의 외부 모델/서버 업로드 금지.
- `registry-pdf-local-reader.ts`: PDF 8MB/20페이지/페이지 객체 9000 제한, PDF.js `getTextContent()` + item 좌표 수집. 인식 실패는 원문/이름이 포함될 수 있는 오류 문자열을 그대로 UI/로그에 반영하지 않음.
- `registry-pdf-layout.ts`: 페이지 순서, Y 좌표 그룹, X 간격을 통한 셀/열 구분, `[PAGE N]` 마커 복원; 초과 상한에서 일부만 분석하는 게 아니라 결과 폐기. **사진 속 말소선/병합 셀은 판단 불가**.
- `/registry/extract`: PDF를 선택하면 자동 추출/분석; 누락페이지/빈 텍스트 경고; 로컬 복사 텍스트·가상 P9 샘플/원문 대조·명시적 사용자의 승인 및 P8 전달 유지. 페이지 텍스트가 없으면 자동 전달 차단.
- `registry-pdf-layout.test.mjs`: 순서가 뒤섞인 조각/한글 토큰 분리/근저당 금액과 일자 칼럼/2페이지/스캔 누락/과대 입력 → P9 후보 추출 연동.
- `registry-pdf-local.spec.ts`: 앱 제공 **완전 허구 영어 PDF**를 브라우저에서 직접 추출, 외부 POST 없음, 갑/을구 미인식 시 불확정, P9 허구 한국어 행의 사람 승낙 후 1회성 세션 전달, 위장 PDF 차단.
- 자세한 아키텍처 및 미완료: [P10 PDF 텍스트층 설계](P10_PDF_AUTOMATIC_TEXTLAYER_20261102.md).

## 실제 PDF 실험 증거의 경계
- P9에서 독립 생성·로컬 렌더한 합성 한국어 PDF는 이전 작업에서 pypdf 텍스트층 추출을 확인했지만, P10 웹 Playwright 테스트는 앱이 제공하는 **영어 허구 PDF**를 이용하므로 추출 파이프라인의 브라우저/워커 통합 성공 여부만 판단한다.
- P10의 한국어 금액·권리 행·말소의 의미 파서는 **가상 좌표 TextItem/가상 텍스트 15건**으로 평가한다. '실제 한국 법원 발급 PDF OCR 정확도' 등으로 쓰면 안 된다.
- 외부 교육용 PDF의 실제 파일·레이아웃 판독 정답표는 아직 확보 못함. 여기서 연속점수나 '안전' 판정 수치를 만들어내지 않는다.

## 검증 이력 / 상태
- PR 생성·CI/실패 원인/보완 커밋/최종 main SHA/실행 스킵을 단계별로 **이 문서 뒤에 append**한다.
- 사진 시각 AI와 코드 변경 충돌 없는지 GitHub 변경 파일 목록을 재검토.
- 실 사용자 2인 거래 E2E·실 등기 API/외부 법무 자문·B 본인확인/C 소유권 검증/Production은 별도 OPEN.

## 2026-11-02 · P10 최종 검증 및 main 병합 확정

- PR [#29](https://github.com/hobism3/meta_p2p_realestate/pull/29), head `f2afc8c8f3df9787ba2bb2cdcdf14368caf75249`; GitHub verify-fast **SUCCESS**, verify-e2e **SUCCESS**.
- **main 병합 완료**: squash commit `74539862ed94639bb6506898e924cdf2a0de201e`.
- Build 단계에서 `pdfjs-dist@4.10.38` 및 해당 로컬 PDF worker(약 1.42MB) 생성/서빙 성공. `npm ci` lock 검증과 Next.js production build PASS.
- Node 단위·DAL **328/328 PASS**; API·READ_ONLY **206/206 PASS**; Playwright PC/모바일 **88 PASS / 4 SKIP / 0 FAIL**. **선별된 실사용자 거래 검증과는 별개**.
- 브라우저 가상 PDF 시연(앱의 ASCII 허구 PDF)이 PDF.js worker를 거쳐 실제 텍스트 textarea에 들어가는 것을 데스크톱·모바일에서 확인. 이 PDF에는 한국어 갑/을구가 없으므로 **'권리 없음'으로 확정하지 않고 구조 불명 처리**하는 것을 확인.
- 15개 P9 한국어 가상 텍스트/8개 추가 P10 좌표 복원 회귀와 사람의 명시적 검토/일회성 권리 정보 전달을 유지. 실제 한국 법원 PDF/OCR 정답 정확도로 확대 해석 금지.
- 별도 시각 AI 사진 가이드 PR #25는 최종 확인 당시 OPEN(head `87ff2f3b`), P10 PR #29와 Git changed filenames **교집합 0개**. 상대 브랜치/사진분석 코드는 수정·병합하지 않음.
- Production URL/실등기 원본·정부 API/법률 자문, 실계정 2인 거래, 스캔 PDF OCR/취소선과 다중등기 완전 복원 검증은 **아직 수행하지 않았음**.

### 원인-수정-검증 기록
1. 최초 CI 빌드: PDF 좌표 검증 코드의 필터 callback 타입 `implicit any` → 유효하지 않은 조각을 **전면 거부하는 명시적 루프**로 보완, 누락된 문자 객체와 너무 긴 줄의 부분 추출 금지.
2. 성능 검토: PDF 텍스트 좌표 행 그룹화가 O(N²)로 느려질 수 있음 → Y 정렬 후 버킷 분리 O(N log N)으로 변경. 페이지당 9,000개 객체의 입력 상한 유지.
3. 최초 Playwright 자동 PDF 시험: 실제 PDF.js 텍스트 추출은 성공했지만 테스트 선택자가 ‘추출 규모:’의 `strong` 요소만 잡아 그 옆 `1페이지` 텍스트를 보지 못함. PC/모바일 **동일 테스트 선택자 오류 2건** → 부모 요소 단위 assertion으로 정정, 최종 88 PASS/4 SKIP.
4. 브라우저에서 PDF.js를 실행하는 과정에 제3자 PDF CDN을 사용하지 않고 사전복제한 동일 버전 로컬 worker 이용. 샘플 PDF는 **GET**으로 앱 자체 가상 PDF를 읽어왔으며 실제 사용자 문서 업로드 POST는 테스트에서 발생하지 않음.
5. 사용자 및 원본 문서에서 추출한 문자열·주소·이름은 Git/서버/Meta API/테스트 로그로 보내지 않음. P8으로 전달되는 값은 검토된 allowlist 정형 입력.

### P11 예정 연결
- 저작권·개인정보 처리가 허용된 **실제 구조를 가진 한국어 합성 PDF**와 사람 검토 정답(페이지/행/문서 좌표/말소선)을 확보.
- 현행/말소 자동 확정 전에는 근거 crop/원본 위치 시각 확인 UX, 별도 OCR/좌표 정확도 평가 체계가 필요.
- 정식 외부 등기 API, 본인확인기관, 건축물대장·선순위 임차인 및 세금 권한, 법적 위험 산정/계약 안정성은 후속 별도 게이트로 유지.

## 2026-11-02 · 별도 Vercel 배포 정합성 감사 (읽기 전용)

**배포 판정: Git main 병합은 완료, Production 코드 최신화는 확인되지 않음.**

- 대상 Vercel 프로젝트: `meta-p2p-realestate` (project `prj_12sWEl9EGK9MFD2vTlwt7a4Zs29u`), GitHub `hobism3/meta_p2p_realestate`.
- Vercel `list_deployments(target=production)`: 최신 READY production은 `dpl_J28x71tYVah5AWWEVKuCanNhfaPk`, GitHub source `main@2d13ed569e`로 확인. P10 main 병합 `74539862`보다 오래된 버전.
- Vercel `list_deployments(sha=74539862ed94639bb6506898e924cdf2a0de201e)`: **0건**. 프리뷰 브랜치에서도 조회 시점 최종 head의 READY를 확인하지 못함(초기 head `82a9fa83`의 ERROR 배포는 조회됨).
- **원인 미확정**: Vercel Git Integration 설정/자동 배포 트리거/프로젝트 접근/빌드 조건 등을 실제 운영 권한을 가진 담당자가 확인해야 함. GitHub Actions CI 통과만으로 운영 URL이 갱신되는 것은 아님.
- 후속 이슈 [#30 — Vercel Production SHA 불일치 조사](https://github.com/hobism3/meta_p2p_realestate/issues/30). 최신 main 인계와 same-origin `/pdf.worker.4.10.38.min.mjs`의 실서비스 200 상태, `/registry/extract` 기능을 배포 후 함께 검증한다.
- 이 확인은 **읽기 전용**. 배포·Promote·Rollback을 임의 실행하지 않았으며 실 사용자/법률/인증 게이트가 해소됐다고 표시하지 않음.
